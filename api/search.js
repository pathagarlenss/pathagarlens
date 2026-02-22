export default async function handler(req, res) {
  const { q, page = 1 } = req.query;

  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    const crossrefRes = await fetch(
      `https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`
    );
    const crossref = await crossrefRes.json();

    const openAlexRes = await fetch(
      `https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`
    );
    const openalex = await openAlexRes.json();

    const semanticRes = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,venue,externalIds,keywords`
    );
    const semantic = await semanticRes.json();

    res.status(200).json({
      crossref: crossref.message?.items || [],
      openalex: openalex.results || [],
      semantic: semantic.data || []
    });

  } catch (error) {
    res.status(500).json({ error: "Fetch failed" });
  }
}
