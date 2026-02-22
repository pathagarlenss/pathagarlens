export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 5;
  const offset = (page - 1) * perPage;

  try {

    const [
      crossrefRes,
      openAlexRes,
      semanticRes,
      doajRes,
      arxivRes,
      pubmedSearchRes,
      europepmcRes,
      dataciteRes,
      zenodoRes
    ] = await Promise.all([

      fetch(`https://api.crossref.org/works?query=${q}&rows=${perPage}&offset=${offset}`),
      fetch(`https://api.openalex.org/works?search=${q}&per-page=${perPage}&page=${page}`),
      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${q}&limit=${perPage}&offset=${offset}&fields=title,authors,year,abstract,url,externalIds,venue,keywords`),
      fetch(`https://doaj.org/api/search/articles/${q}?page=${page}&pageSize=${perPage}`),
      fetch(`https://export.arxiv.org/api/query?search_query=all:${q}&start=${offset}&max_results=${perPage}`),
      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${q}&retmax=${perPage}&retstart=${offset}&retmode=json`),
      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=${perPage}&page=${page}`),
      fetch(`https://api.datacite.org/dois?query=${q}&page[size]=${perPage}&page[number]=${page}`),
      fetch(`https://zenodo.org/api/records?q=${q}&size=${perPage}&page=${page}`)
    ]);

    const results = [];

    /* -------- CROSSREF -------- */
    const crossref = await crossrefRes.json();
    (crossref?.message?.items || []).forEach(item => {
      results.push({
        title: item.title?.[0],
        authors: item.author?.map(a=>a.given+" "+a.family).join(", "),
        journal: item['container-title']?.[0],
        volume: item.volume,
        issue: item.issue,
        issn: item.ISSN?.join(", "),
        year: item.created?.["date-parts"]?.[0]?.[0],
        abstract: item.abstract,
        keywords: "",
        doi: item.DOI,
        link: item.DOI ? `https://doi.org/${item.DOI}` : "",
        source: "Crossref"
      });
    });

    /* -------- OPENALEX -------- */
    const openalex = await openAlexRes.json();
    (openalex?.results || []).forEach(item => {
      results.push({
        title: item.title,
        authors: item.authorships?.map(a=>a.author.display_name).join(", "),
        journal: item.host_venue?.display_name,
        volume: item.biblio?.volume,
        issue: item.biblio?.issue,
        issn: item.host_venue?.issn_l,
        year: item.publication_year,
        abstract: "",
        keywords: item.concepts?.map(c=>c.display_name).join(", "),
        doi: item.doi,
        link: item.doi,
        source: "OpenAlex"
      });
    });

    /* -------- SEMANTIC -------- */
    const semantic = await semanticRes.json();
    (semantic?.data || []).forEach(item => {
      results.push({
        title: item.title,
        authors: item.authors?.map(a=>a.name).join(", "),
        journal: item.venue,
        volume: "",
        issue: "",
        issn: "",
        year: item.year,
        abstract: item.abstract,
        keywords: item.keywords?.map(k=>k.name).join(", "),
        doi: item.externalIds?.DOI,
        link: item.url,
        source: "Semantic Scholar"
      });
    });

    /* -------- DOAJ -------- */
    const doajData = await doajRes.json();
    (doajData?.results || []).forEach(item => {
      const bib = item.bibjson || {};
      results.push({
        title: bib.title,
        authors: bib.author?.map(a=>a.name).join(", "),
        journal: bib.journal?.title,
        volume: bib.journal?.volume,
        issue: bib.journal?.number,
        issn: bib.journal?.issn?.join(", "),
        year: bib.year,
        abstract: bib.abstract,
        keywords: bib.keywords?.join(", "),
        doi: bib.identifier?.find(id=>id.type==="doi")?.id,
        link: bib.link?.[0]?.url,
        source: "DOAJ"
      });
    });

    /* -------- arXiv -------- */
    const arxivXML = await arxivRes.text();
    const entries = arxivXML.split("<entry>").slice(1);
    entries.forEach(entry => {

      const extract = (tag) => {
        const match = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return match ? match[1].replace(/\s+/g,' ').trim() : "";
      };

      const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)]
        .map(a => a[1])
        .join(", ");

      results.push({
        title: extract("title"),
        authors,
        journal: "arXiv Preprint",
        volume: "",
        issue: "",
        issn: "",
        year: extract("published")?.substring(0,4),
        abstract: extract("summary"),
        keywords: "",
        doi: "",
        link: extract("id"),
        source: "arXiv"
      });
    });

    /* -------- PUBMED -------- */
const pubmedSearchData = await pubmedSearchRes.json();
const ids = pubmedSearchData?.esearchresult?.idlist || [];

if (ids.length > 0) {

  const summaryRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
  );

  const summaryData = await summaryRes.json();

  ids.forEach(id => {
    const item = summaryData.result[id];

    results.push({
      title: item?.title,
      authors: item?.authors?.map(a => a.name).join(", "),
      journal: item?.fulljournalname,
      volume: "",
      issue: "",
      issn: "",
      year: item?.pubdate?.substring(0,4),
      abstract: "",
      keywords: "",
      doi: item?.elocationid?.startsWith("doi:")
           ? item.elocationid.replace("doi:","")
           : "",
      link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      source: "PubMed"
    });
  });

}

    /* -------- EUROPE PMC -------- */
    const europepmcData = await europepmcRes.json();
    (europepmcData?.resultList?.result || []).forEach(item => {
      results.push({
        title: item.title,
        authors: item.authorString,
        journal: item.journalTitle,
        volume: item.volume,
        issue: item.issue,
        issn: item.issn,
        year: item.pubYear,
        abstract: item.abstractText,
        keywords: "",
        doi: item.doi,
        link: item.doi ? `https://doi.org/${item.doi}` :
              `https://europepmc.org/article/${item.source}/${item.id}`,
        source: "Europe PMC"
      });
    });

    /* -------- DATACITE -------- */
    const dataciteData = await dataciteRes.json();
    (dataciteData?.data || []).forEach(item => {
      results.push({
        title: item.attributes?.titles?.[0]?.title,
        authors: item.attributes?.creators?.map(a => a.name).join(", "),
        journal: item.attributes?.publisher,
        volume: "",
        issue: "",
        issn: "",
        year: item.attributes?.publicationYear,
        abstract: item.attributes?.descriptions?.[0]?.description,
        keywords: "",
        doi: item.attributes?.doi,
        link: item.attributes?.url || `https://doi.org/${item.attributes?.doi}`,
        source: "DataCite"
      });
    });

    /* -------- ZENODO -------- */
    const zenodoData = await zenodoRes.json();
    (zenodoData?.hits?.hits || []).forEach(item => {
      results.push({
        title: item.metadata?.title,
        authors: item.metadata?.creators?.map(a => a.name).join(", "),
        journal: item.metadata?.publication_type || "Zenodo Record",
        volume: "",
        issue: "",
        issn: "",
        year: item.metadata?.publication_date?.substring(0,4),
        abstract: item.metadata?.description,
        keywords: "",
        doi: item.metadata?.doi,
        link: item.links?.doi || item.links?.html,
        source: "Zenodo"
      });
    });

    res.status(200).json({ results });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
