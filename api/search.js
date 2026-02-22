export default async function handler(req, res) {
  const { q, page = 1 } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing query" });
  }

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

    // SEMANTIC SCHOLAR
    const semanticRes = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,url,externalIds`
    );
    const semantic = await semanticRes.json();

    return res.status(200).json({
      crossref: crossref.message?.items || [],
      openalex: openalex.results || [],
      semantic: semantic.data || []
    });

  } catch (error) {
    return res.status(500).json({ error: "Fetch failed" });
  }
}
