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

    res.status(200).json({
      crossref: crossref?.message?.items || [],
      openalex: openalex?.results || [],
      semantic: semantic?.data || [],
      doaj: doaj
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
