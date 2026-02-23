export default async function handler(req, res) {

  const { q, page = 1 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing query" });

  const perPage = 10;
  const fetchLimit = 50;
  const currentPage = Number(page) || 1;

  try {

    const requests = await Promise.allSettled([

      fetch(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${fetchLimit}`),

      fetch(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${fetchLimit}`),

      fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=${fetchLimit}&fields=title,authors,year,url,externalIds,venue`),

      fetch(`https://doaj.org/api/v2/search/articles?q=${encodeURIComponent(q)}&pageSize=${fetchLimit}`),

      fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=${fetchLimit}`),

      fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=${fetchLimit}&retmode=json`),

      fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=${fetchLimit}`),

      fetch(`https://api.datacite.org/dois?query=${encodeURIComponent(q)}&page[size]=${fetchLimit}`),

      fetch(`https://zenodo.org/api/records?q=${encodeURIComponent(q)}&size=${fetchLimit}`)
    ]);

    const safeJson = async (r) => {
      if (r.status === "fulfilled") {
        try { return await r.value.json(); }
        catch { return {}; }
      }
      return {};
    };

    const crossref = await safeJson(requests[0]);
    const openalex = await safeJson(requests[1]);
    const semantic = await safeJson(requests[2]);
    const doajData = await safeJson(requests[3]);
    const pubmedSearch = await safeJson(requests[5]);
    const epmcData = await safeJson(requests[6]);
    const dcData = await safeJson(requests[7]);
    const zenData = await safeJson(requests[8]);

    // =========================
    // ARXIV PARSE
    // =========================
    let arxiv = [];

    if (requests[4].status === "fulfilled") {
      try {
        const xml = await requests[4].value.text();
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
            source: "arXiv",
            title: extract("title") || "",
            authors,
            journal: "arXiv",
            year: extract("published")?.substring(0,4) || "",
            doi: "",
            link: extract("id") || ""
          };
        });

      } catch {}
    }

    // =========================
    // PUBMED DETAILS
    // =========================
    let pubmed = [];

    try {
      const ids = pubmedSearch?.esearchresult?.idlist || [];

      if (ids.length) {

        const detailRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`
        );

        const detailData = await detailRes.json();

        pubmed = ids.map(id => {
          const item = detailData.result[id];
          return {
            source: "PubMed",
            title: item?.title || "",
            authors: item?.authors?.map(a=>a.name).slice(0,5).join(", ") || "",
            journal: item?.fulljournalname || "",
            year: item?.pubdate?.substring(0,4) || "",
            doi: item?.elocationid?.startsWith("doi:")
                  ? item.elocationid.replace("doi:","")
                  : "",
            link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
          };
        });
      }
    } catch {}

    // =========================
    // FORMAT OTHER DATABASES
    // =========================

    const crossrefData = (crossref?.message?.items || []).map(item => ({
      source: "Crossref",
      title: item.title?.[0] || "",
      authors: item.author?.map(a=>a.given+" "+a.family).slice(0,5).join(", ") || "",
      journal: item["container-title"]?.[0] || "",
      year: item.created?.["date-parts"]?.[0]?.[0] || "",
      doi: item.DOI || "",
      link: item.DOI ? `https://doi.org/${item.DOI}` : ""
    }));

    const openalexData = (openalex?.results || []).map(item => ({
      source: "OpenAlex",
      title: item.title || "",
      authors: item.authorships?.map(a=>a.author.display_name).slice(0,5).join(", ") || "",
      journal: item.host_venue?.display_name || "",
      year: item.publication_year || "",
      doi: item.doi || "",
      link: item.doi
        ? `https://doi.org/${item.doi.replace(/^https?:\/\/doi\.org\//,'')}`
        : item.primary_location?.landing_page_url || item.id || ""
    }));

    const semanticData = (semantic?.data || []).map(item => ({
      source: "Semantic Scholar",
      title: item.title || "",
      authors: item.authors?.map(a=>a.name).slice(0,5).join(", ") || "",
      journal: item.venue || "",
      year: item.year || "",
      doi: item.externalIds?.DOI || "",
      link: item.url || ""
    }));

    const doaj = (doajData?.results || []).map(item=>{
      const bib = item?.bibjson || {};
      return {
        source: "DOAJ",
        title: bib.title || "",
        authors: bib.author?.map(a=>a.name).slice(0,5).join(", ") || "",
        journal: bib.journal?.title || "",
        year: bib.year || "",
        doi: bib.identifier?.find(id=>id.type==="doi")?.id || "",
        link: bib.link?.[0]?.url || ""
      };
    });

    const europepmc = (epmcData?.resultList?.result || []).map(item=>({
      source: "Europe PMC",
      title: item.title || "",
      authors: item.authorString?.split(",").slice(0,5).join(", ") || "",
      journal: item.journalTitle || "",
      year: item.pubYear || "",
      doi: item.doi || "",
      link: item.doi
        ? `https://doi.org/${item.doi}`
        : `https://europepmc.org/article/${item.source}/${item.id}`
    }));

    const datacite = (dcData?.data || []).map(item=>({
      source: "DataCite",
      title: item.attributes?.titles?.[0]?.title || "",
      authors: item.attributes?.creators?.map(a=>a.name).slice(0,5).join(", ") || "",
      journal: item.attributes?.publisher || "",
      year: item.attributes?.publicationYear || "",
      doi: item.attributes?.doi || "",
      link: item.attributes?.url || `https://doi.org/${item.attributes?.doi || ""}`
    }));

    const zenodo = (zenData?.hits?.hits || []).map(item=>({
      source: "Zenodo",
      title: item.metadata?.title || "",
      authors: item.metadata?.creators?.map(a=>a.name).slice(0,5).join(", ") || "",
      journal: "Zenodo",
      year: item.metadata?.publication_date?.substring(0,4) || "",
      doi: item.metadata?.doi || "",
      link: item.links?.doi || item.links?.html || ""
    }));

    // =========================
    // MERGE ALL
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

    // REMOVE DUPLICATE DOI
    const seen = new Set();
    allResults = allResults.filter(item => {
      if (!item.doi) return true;
      const clean = item.doi.toLowerCase();
      if (seen.has(clean)) return false;
      seen.add(clean);
      return true;
    });

    // EXACT MATCH FIRST
    const queryLower = q.toLowerCase().trim();
    allResults.sort((a,b)=>{
      const aExact = a.title?.toLowerCase().trim() === queryLower;
      const bExact = b.title?.toLowerCase().trim() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    const totalResults = allResults.length;
    const start = (currentPage - 1) * perPage;
    const end = start + perPage;

    res.status(200).json({
      results: allResults.slice(start, end),
      totalResults
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fetch failed" });
  }
}
