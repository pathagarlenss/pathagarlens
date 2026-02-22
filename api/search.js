export default async function handler(req, res) {
  const { q, page = 1 } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing query parameter" });
  }

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {
    const crossrefRes = await fetch(
      `https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`
    );
    const crossrefData = await crossrefRes.json();

    const semanticRes = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year`
    );
    const semanticData = await semanticRes.json();

    const openAlexRes = await fetch(
      `https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`
    );
    const openAlexData = await openAlexRes.json();

    return res.status(200).json({
      crossref: crossrefData.message.items,
      semantic: semanticData.data,
      openalex: openAlexData.results,
    });

  } catch (error) {
    return res.status(500).json({ error: "API fetch failed" });
  }
}
