export default async function handler(req, res) {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing query parameter" });
  }

  try {
    // Crossref
    const crossrefRes = await fetch(
      `https://api.crossref.org/works?query=${q}&rows=3`
    );
    const crossrefData = await crossrefRes.json();

    // Semantic Scholar
    const semanticRes = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=3&fields=title,authors,year`
    );
    const semanticData = await semanticRes.json();

    // OpenAlex
    const openAlexRes = await fetch(
      `https://api.openalex.org/works?search=${q}&per-page=3`
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
