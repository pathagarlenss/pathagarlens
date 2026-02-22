export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    const requests = [
      fetch(`https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`),
      fetch(`https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`),
      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,url,externalIds,venue,keywords`),
      fetch(`https://doaj.org/api/search/articles/${q}?page=${page}&pageSize=10`),
      fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&start=${offset}&max_results=10`),
      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=10&page=${page}`),
      fetch(`https://api.datacite.org/dois?query=${q}&page[size]=10&page[number]=${page}`),
      fetch(`https://zenodo.org/api/records?q=${q}&size=10&page=${page}`)
    ];

    const responses = await Promise.allSettled(requests);

    const getJSON = async (response) => {
      if (response.status !== "fulfilled") return null;
      if (!response.value.ok) return null;
      return await response.value.json().catch(() => null);
    };

    const crossref = await getJSON(responses[0]);
    const openalex = await getJSON(responses[1]);
    const semantic = await getJSON(responses[2]);
    const doaj = await getJSON(responses[3]);
    const europepmc = await getJSON(responses[5]);
    const datacite = await getJSON(responses[6]);
    const zenodo = await getJSON(responses[7]);

    // arXiv (XML)
    let arxiv = [];
    if (responses[4].status === "fulfilled" && responses[4].value.ok) {
      const xml = await responses[4].value.text();
      const entries = xml.split("<entry>").slice(1);

      arxiv = entries.map(entry => {
        const extract = (tag) => {
          const match = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
          return match ? match[1].replace(/\s+/g,' ').trim() : "";
        };

        const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)]
          .map(a => a[1])
          .join(", ");

        return {
          title: extract("title"),
          abstract: extract("summary"),
          authors,
          year: extract("published")?.substring(0,4),
          link: extract("id")
        };
      });
    }

    res.status(200).json({
      crossref: crossref?.message?.items || [],
      openalex: openalex?.results || [],
      semantic: semantic?.data || [],
      doaj: doaj?.results || [],
      arxiv,
      europepmc: europepmc?.resultList?.result || [],
      datacite: datacite?.data || [],
      zenodo: zenodo?.hits?.hits || []
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
