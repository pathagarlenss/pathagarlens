tatus(500).json({ error: "Fetch failed" });
  }
}
export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    const [
      crossrefRes,
      openAlexRes,
      semanticRes,
      doajRes,
      arxivRes,
      europepmcRes,
      dataciteRes,
      zenRes
    ] = await Promise.allSettled([

      fetch(`https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`),

      fetch(`https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`),

      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,url,externalIds,venue,keywords`),

      fetch(`https://doaj.org/api/search/articles/${q}?page=${page}&pageSize=10`),

      fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&start=${offset}&max_results=10`),

      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=10&page=${page}`),

      fetch(`https://api.datacite.org/dois?query=${q}&page[size]=10&page[number]=${page}`),

      fetch(`https://zenodo.org/api/records?q=${q}&size=10&page=${page}`)
    ]);

    // Helper safe parser
    const safeJson = async (res) =>
      res.status === "fulfilled" ? await res.value.json() : null;

    const crossref = await safeJson(crossrefRes);
    const openalex = await safeJson(openAlexRes);
    const semantic = await safeJson(semanticRes);
    const doaj = await safeJson(doajRes);
    const europepmc = await safeJson(europepmcRes);
    const datacite = await safeJson(dataciteRes);
    const zenodo = await safeJson(zenRes);

    // arXiv XML parse
    let arxiv = [];
    if (arxivRes.status === "fulfilled") {
      const xml = await arxivRes.value.text();
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
          authors: authors,
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
      arxiv: arxiv || [],
      europepmc: europepmc?.resultList?.result || [],
      datacite: datacite?.data || [],
      zenodo: zenodo?.hits?.hits || []
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
