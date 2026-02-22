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


    // PUBMED
let pubmed = [];

try {
  // Step 1: search
  const searchRes = await fetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${q}&retmax=10&retstart=${offset}&retmode=json`
  );

  const searchData = await searchRes.json();
  const ids = searchData?.esearchresult?.idlist || [];

  if(ids.length > 0){

    // Step 2: fetch details
    const fetchRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
    );

    const fetchData = await fetchRes.json();

    pubmed = ids.map(id => {
      const item = fetchData.result[id];
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

} catch (e) {
  console.log("PubMed failed");
}

// EUROPE PMC
let europepmc = [];

try {

  const epmcRes = await fetch(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=10&page=${page}`
  );

  const epmcData = await epmcRes.json();

  const results = epmcData?.resultList?.result || [];

  europepmc = results.map(item => ({
    title: item.title,
    authors: item.authorString,
    journal: item.journalTitle,
    volume: item.volume,
    issue: item.issue,
    issn: item.issn,
    year: item.pubYear,
    abstract: item.abstractText,
    doi: item.doi,
    link: item.doi 
          ? `https://doi.org/${item.doi}` 
          : `https://europepmc.org/article/${item.source}/${item.id}`
  }));

} catch (e) {
  console.log("Europe PMC failed");
}

    // DATACITE
let datacite = [];

try {

  const dcRes = await fetch(
    `https://api.datacite.org/dois?query=${q}&page[size]=10&page[number]=${page}`
  );

  const dcData = await dcRes.json();

  const results = dcData?.data || [];

  datacite = results.map(item => ({
    title: item.attributes?.titles?.[0]?.title,
    authors: item.attributes?.creators?.map(a => a.name).join(", "),
    journal: item.attributes?.publisher,
    volume: "",
    issue: "",
    issn: "",
    year: item.attributes?.publicationYear,
    abstract: item.attributes?.descriptions?.[0]?.description,
    doi: item.attributes?.doi,
    link: item.attributes?.url 
          ? item.attributes.url 
          : `https://doi.org/${item.attributes?.doi}`
  }));

} catch (e) {
  console.log("DataCite failed");
}

    // ZENODO
let zenodo = [];

try {

  const zenRes = await fetch(
    `https://zenodo.org/api/records?q=${q}&size=10&page=${page}`
  );

  const zenData = await zenRes.json();
  const hits = zenData?.hits?.hits || [];

  zenodo = hits.map(item => ({
    title: item.metadata?.title,
    authors: item.metadata?.creators?.map(a => a.name).join(", "),
    journal: item.metadata?.publication_type || "Zenodo Record",
    volume: "",
    issue: "",
    issn: "",
    year: item.metadata?.publication_date?.substring(0,4),
    abstract: item.metadata?.description,
    doi: item.metadata?.doi,
    link: item.links?.doi 
          ? item.links.doi 
          : item.links?.html
  }));

} catch (e) {
  console.log("Zenodo failed");
}

    // OPENAIRE
let openaire = [];

try {

  const oaRes = await fetch(
    `https://api.openaire.eu/search/publications?format=json&keywords=${q}&size=10&page=${page}`
  );

  const oaData = await oaRes.json();

  const results = oaData?.response?.results?.result || [];

  openaire = results.map(item => {

    const metadata = item.metadata?.oaf_entity?.oaf_result || {};

    return {
      title: metadata.title,
      authors: metadata.creator,
      journal: metadata.publisher,
      volume: "",
      issue: "",
      issn: "",
      year: metadata.dateofacceptance?.substring(0,4),
      abstract: metadata.description,
      doi: metadata.pid,
      link: metadata.pid ? `https://doi.org/${metadata.pid}` : ""
    };
  });

} catch (e) {
  console.log("OpenAIRE failed");
}

    // REPEC (IDEAS)
let repec = [];

try {

  const repRes = await fetch(
    `https://ideas.repec.org/cgi-bin/htsearch?q=${q}&format=json`
  );

  const repData = await repRes.json();

  const results = repData?.results || [];

  repec = results.slice(0,10).map(item => ({
    title: item.title,
    authors: item.authors,
    journal: item.publication,
    volume: "",
    issue: "",
    issn: "",
    year: item.year,
    abstract: "",
    doi: "",
    link: item.url
  }));

} catch (e) {
  console.log("RePEc failed");
}
    
    res.status(200).json({
      crossref: crossref?.message?.items || [],
      openalex: openalex?.results || [],
      semantic: semantic?.data || [],
      doaj: doaj || [],
      arxiv: arxiv || [],
      pubmed: pubmed || [],
      europepmc: europepmc || [],
      datacite: datacite || [],
      zenodo: zenodo || [],
      openaire: openaire || [],
      repec: repec || []
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
