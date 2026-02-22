export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    // CROSSREF
    const crossrefRes = await fetch(
      `https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`
    );
    const crossref = await crossrefRes.json();

    // OPENALEX
    const openAlexRes = await fetch(
      `https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`
    );
    const openalex = await openAlexRes.json();

    // SEMANTIC
    const semanticRes = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,url,externalIds,venue,keywords`
    );
    const semantic = await semanticRes.json();

    // DOAJ (SAFE BLOCK)
    let doaj = [];
    try {
      const doajRes = await fetch(
        `https://doaj.org/api/search/articles/${q}?page=${page}&pageSize=10`
      );
      const doajData = await doajRes.json();
      doaj = doajData?.results || [];
    } catch (e) {
      console.log("DOAJ failed");
    }

// arXiv)
    
   let arxiv = [];

try {
  const arxivRes = await fetch(
    `https://export.arxiv.org/api/query?search_query=all:${q}&start=${offset}&max_results=10`
  );

  const xml = await arxivRes.text();

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

} catch (e) {
  console.log("arXiv error");
}

    res.status(200).json({
      crossref: crossref?.message?.items || [],
      openalex: openalex?.results || [],
      semantic: semantic?.data || [],
      doaj: doaj || [],
       semantic: semantic?.data || []
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
