export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    // 🔥 ALL PRIMARY FETCHES IN PARALLEL
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
    ] = await Promise.all([

      fetch(`https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`),
      fetch(`https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`),
      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,url,externalIds,venue,keywords`),
      fetch(`https://doaj.org/api/search/articles/${q}?page=${page}&pageSize=10`),
      fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&start=${offset}&max_results=10`),
      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${q}&retmax=10&retstart=${offset}&retmode=json`),
      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=10&page=${page}`),
      fetch(`https://api.datacite.org/dois?query=${q}&page[size]=10&page[number]=${page}`),
      fetch(`https://zenodo.org/api/records?q=${q}&size=10&page=${page}`)

    ]);

    // 🔥 CONVERT TO JSON / TEXT
    const crossref = await crossrefRes.json();
    const openalex = await openAlexRes.json();
    const semantic = await semanticRes.json();
    const doajData = await doajRes.json();
    const arxivXML = await arxivRes.text();
    const pubmedSearch = await pubmedSearchRes.json();
    const europepmc = await epmcRes.json();
    const datacite = await dcRes.json();
    const zenodo = await zenRes.json();

    // -------------------------
    // DOAJ
    const doaj = doajData?.results || [];

    // -------------------------
    // arXiv parse
    const arxivEntries = arxivXML.split("<entry>").slice(1);

    const arxiv = arxivEntries.map(entry => {

      const extract = tag => {
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

    // -------------------------
    // PubMed second fetch (needs IDs)
    let pubmed = [];
    const ids = pubmedSearch?.esearchresult?.idlist || [];

    if(ids.length > 0){

      const pubmedSummaryRes = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
      );

      const pubmedSummary = await pubmedSummaryRes.json();

      pubmed = ids.map(id => {
        const item = pubmedSummary.result[id];
        return {
          title: item.title,
          authors: item.authors?.map(a => a.name).join(", "),
          journal: item.fulljournalname,
          year: item.pubdate?.substring(0,4),
          doi: item.elocationid?.startsWith("doi:")
            ? item.elocationid.replace("doi:","")
            : "",
          link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
        };
      });
    }

    // -------------------------
    // Europe PMC
    const europepmcData = europepmc?.resultList?.result || [];

    // -------------------------
    // DataCite
    const dataciteData = datacite?.data || [];

    // -------------------------
    // Zenodo
    const zenodoData = zenodo?.hits?.hits || [];

    // -------------------------

    res.status(200).json({
      crossref: crossref?.message?.items || [],
      openalex: openalex?.results || [],
      semantic: semantic?.data || [],
      doaj,
      arxiv,
      pubmed,
      europepmc: europepmcData,
      datacite: dataciteData,
      zenodo: zenodoData
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
