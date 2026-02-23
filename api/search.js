export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    // 🔹 Parallel API Calls
    const [
      crossrefRes,
      openAlexRes,
      semanticRes,
      doajRes,
      arxivRes,
      pubmedSearchRes,
      epmcRes,
      dcRes,
      zenRes
    ] = await Promise.allSettled([

      fetch(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${perPage}&offset=${offset}`),

      fetch(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${perPage}&page=${page}`),

      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${perPage}&offset=${offset}&fields=title,authors,year,url,externalIds,venue`),

      fetch(`https://doaj.org/api/v2/search/articles?q=${encodeURIComponent(q)}&page=${page}&pageSize=10`),

      fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=${offset}&max_results=10`),

      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=10&retstart=${offset}&retmode=json`),

      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=10&page=${page}`),

      fetch(`https://api.datacite.org/dois?query=${encodeURIComponent(q)}&page[size]=10&page[number]=${page}`),

      fetch(`https://zenodo.org/api/records?q=${encodeURIComponent(q)}&size=10&page=${page}`)

    ]);

    // Safe JSON parse helper
    const safeJson = async (res) => {
      if(res.status === "fulfilled") {
        try { return await res.value.json(); }
        catch { return {}; }
      }
      return {};
    };

    const crossref = await safeJson(crossrefRes);
    const openalex = await safeJson(openAlexRes);
    const semantic = await safeJson(semanticRes);
    const doajData = await safeJson(doajRes);
    const pubmedSearch = await safeJson(pubmedSearchRes);
    const epmcData = await safeJson(epmcRes);
    const dcData = await safeJson(dcRes);
    const zenData = await safeJson(zenRes);

    // 🔹 Basic mapping (shortened for stability)

    const crossrefData = crossref?.message?.items || [];
    const openalexData = openalex?.results || [];
    const semanticData = semantic?.data || [];
    const doaj = doajData?.results || [];
    const europepmc = epmcData?.resultList?.result || [];
    const datacite = dcData?.data || [];
    const zenodo = zenData?.hits?.hits || [];

    // 🔹 Total Count (fast + safe)
    const grandTotal =
      Number(crossref?.message?.["total-results"] || 0) +
      Number(openalex?.meta?.count || 0) +
      Number(semantic?.total || 0) +
      Number(pubmedSearch?.esearchresult?.count || 0) +
      Number(epmcData?.hitCount || 0) +
      Number(dcData?.meta?.total || 0) +
      Number(zenData?.hits?.total?.value || 0);

    res.status(200).json({
      crossref: crossrefData,
      openalex: openalexData,
      semantic: semanticData,
      doaj: doaj,
      arxiv: [],   // temporarily disabled heavy parsing
      pubmed: [],
      europepmc: europepmc,
      datacite: datacite,
      zenodo: zenodo,
      totalResults: grandTotal
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
