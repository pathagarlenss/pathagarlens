export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {

    const [
      crossrefRes,
      openAlexRes,
      semanticRes,
      doajRes,
      arxivRes,
      pubmedRes,
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

    const safeJson = async (r) => {
      if (r.status === "fulfilled") {
        try { return await r.value.json(); }
        catch { return {}; }
      }
      return {};
    };

    const crossref = await safeJson(crossrefRes);
    const openalex = await safeJson(openAlexRes);
    const semantic = await safeJson(semanticRes);
    const doajData = await safeJson(doajRes);
    const pubmedData = await safeJson(pubmedRes);
    const epmcData = await safeJson(epmcRes);
    const dcData = await safeJson(dcRes);
    const zenData = await safeJson(zenRes);

    // =========================
    // ARXIV PARSE
    // =========================
    let arxiv = [];

    if (arxivRes.status === "fulfilled") {
      try {
        const xml = await arxivRes.value.text();
        const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];

        arxiv = entries.map(entry => {

          const extract = (tag) => {
            const match = entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
            return match ? match[1].replace(/\s+/g,' ').trim() : "";
          };

          const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)]
            .map(a => a[1])
            .slice(0,5)
            .join(", ");

          return {
            title: extract("title"),
            authors,
            journal: "arXiv Preprint",
            year: extract("published")?.substring(0,4),
            doi: "",
            link: extract("id")
          };
        });

      } catch {}
    }

    // =========================
    // PUBMED FORMAT
    // =========================
    let pubmed = [];

    if (pubmedData?.esearchresult?.idlist?.length) {
      const ids = pubmedData.esearchresult.idlist;

      const fetchDetails = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
      );

      const detailData = await fetchDetails.json();

      pubmed = ids.map(id => {
        const item = detailData.result[id];
        return {
          title: item?.title,
          authors: item?.authors?.map(a => a.name).slice(0,5).join(", "),
          journal: item?.fulljournalname,
          year: item?.pubdate?.substring(0,4),
          doi: item?.elocationid?.replace("doi:",""),
          link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
        };
      });
    }

    // =========================
    // FORMAT OTHERS
    // =========================

    const crossrefData = (crossref?.message?.items || []).map(item => ({
      title: item.title?.[0],
      authors: item.author?.map(a=>a.given+" "+a.family).slice(0,5).join(", "),
      journal: item["container-title"]?.[0],
      year: item.created?.["date-parts"]?.[0]?.[0],
      doi: item.DOI,
      link: item.DOI ? `https://doi.org/${item.DOI}` : ""
    }));

    const openalexData = (openalex?.results || []).map(item => ({
      title: item.title,
      authors: item.authorships?.map(a=>a.author.display_name).slice(0,5).join(", "),
      journal: item.host_venue?.display_name,
      year: item.publication_year,
      doi: item.doi,
      link: item.doi
        ? `https://doi.org/${item.doi.replace(/^https?:\/\/doi\.org\//,'')}`
        : item.primary_location?.landing_page_url || item.id
    }));

    const semanticData = (semantic?.data || []).map(item => ({
      title: item.title,
      authors: item.authors?.map(a=>a.name).slice(0,5).join(", "),
      journal: item.venue,
      year: item.year,
      doi: item.externalIds?.DOI,
      link: item.url
    }));

    const doaj = (doajData?.results || []).map(item=>{
      const bib = item?.bibjson || {};
      return {
        title: bib.title,
        authors: bib.author?.map(a=>a.name).slice(0,5).join(", "),
        journal: bib.journal?.title,
        year: bib.year,
        doi: bib.identifier?.find(id=>id.type==="doi")?.id,
        link: bib.link?.[0]?.url
      };
    });

    const europepmc = (epmcData?.resultList?.result || []).map(item=>({
      title: item.title,
      authors: item.authorString?.split(",").slice(0,5).join(", "),
      journal: item.journalTitle,
      year: item.pubYear,
      doi: item.doi,
      link: item.doi
        ? `https://doi.org/${item.doi}`
        : `https://europepmc.org/article/${item.source}/${item.id}`
    }));

    const datacite = (dcData?.data || []).map(item=>({
      title: item.attributes?.titles?.[0]?.title,
      authors: item.attributes?.creators?.map(a=>a.name).slice(0,5).join(", "),
      journal: item.attributes?.publisher,
      year: item.attributes?.publicationYear,
      doi: item.attributes?.doi,
      link: item.attributes?.url || `https://doi.org/${item.attributes?.doi}`
    }));

    const zenodo = (zenData?.hits?.hits || []).map(item=>({
      title: item.metadata?.title,
      authors: item.metadata?.creators?.map(a=>a.name).slice(0,5).join(", "),
      journal: "Zenodo",
      year: item.metadata?.publication_date?.substring(0,4),
      doi: item.metadata?.doi,
      link: item.links?.doi || item.links?.html
    }));

    // =========================
    // MERGE
    // =========================
    let allResults = [
      ...crossrefData,
      ...openalexData,
      ...semanticData,
      ...doaj,
      ...arxiv,
      ...pubmed,
      ...europepmc,
      ...datacite,
      ...zenodo
    ];

    // =========================
    // REMOVE DUPLICATE DOI
    // =========================
    const seen = new Set();
    allResults = allResults.filter(item => {
      if (!item.doi) return true;
      const d = item.doi.toLowerCase();
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });

    // =========================
    // EXACT MATCH FIRST
    // =========================
    const queryLower = q.toLowerCase().trim();
    allResults.sort((a,b)=>{
      const aExact = a.title?.toLowerCase().trim() === queryLower;
      const bExact = b.title?.toLowerCase().trim() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    const totalResults = allResults.length;

    res.status(200).json({
      results: allResults,
      totalResults
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
