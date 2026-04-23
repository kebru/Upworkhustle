(() => {
  function text(el) {
    return el ? el.textContent.trim() : "";
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  const isSearchJobs = location.pathname.startsWith("/nx/search/jobs");

  const tiles = isSearchJobs
    ? qsa('article[data-test="JobTile"]')
    : qsa('section.air3-card-section[data-ev-opening_uid]');

  if (!isSearchJobs && tiles.length === 0) {
    const fallback = qsa('[data-test="job-tile-list"] section');
    if (fallback.length > 0) tiles.push(...fallback);
  }

  const MAX_JOBS = 50;
  const jobs = tiles.slice(0, MAX_JOBS).map((tile) => {
    // Prefer a real job link that points to /jobs/
    const jobLinkEl =
      qs('a[data-test*="job-tile-title-link"][href^="/jobs/"]', tile) ||
      qs('a[href^="/jobs/"]', tile) ||
      qs("h3.job-tile-title a", tile) ||
      qs("h3 a", tile);
    const title = text(jobLinkEl) || text(qs("h3", tile)) || text(qs("h2", tile));
    const href = jobLinkEl?.getAttribute("href") || "";
    const jobUrl = href ? (href.startsWith("http") ? href : `https://www.upwork.com${href}`) : "";

    const descEl =
      qs('[data-test="job-description-text"]', tile) ||
      qs('[data-test*="JobDescription"]', tile) ||
      qs(".job-tile-description", tile);
    const description = text(descEl);

    const skillEls = isSearchJobs
      ? qsa('[data-test*="TokenClamp JobAttrs"] [data-test="token"]', tile)
      : qsa('[data-test="token-container"] a[data-test="attr-item"]', tile);
    const skills = skillEls.map((el) => text(el)).filter(Boolean);

    const postedOn =
      text(qs('[data-test="posted-on"]', tile)) ||
      text(qs('[data-test="job-pubilshed-date"]', tile));
    const budget =
      text(qs('[data-test="budget"]', tile)) ||
      text(qs('[data-test="is-fixed-price"]', tile));
    const duration = text(qs('[data-test="duration"]', tile));
    const jobType =
      text(qs('[data-test="job-type"]', tile)) ||
      text(qs('[data-test="job-type-label"]', tile));
    const contractorTier = text(qs('[data-test="contractor-tier"]', tile));

    const hasMore = !!qs('[data-test="job-description-line-clamp"]', tile);

    const parts = [];
    if (title) parts.push(`TITLE: ${title}`);
    if (postedOn) parts.push(`POSTED: ${postedOn}`);
    if (jobType) parts.push(`TYPE: ${jobType}`);
    if (budget) parts.push(`BUDGET: ${budget}`);
    if (duration) parts.push(`DURATION: ${duration}`);
    if (jobUrl) parts.push(`URL: ${jobUrl}`);
    if (skills.length > 0) parts.push(`SKILLS: ${skills.join(", ")}`);
    parts.push("");
    parts.push("DESCRIPTION:");
    if (description) parts.push(description);

    return {
      jobText: parts.join("\n\n"),
      title,
      jobUrl,
      budget,
      duration,
      jobType,
      contractorTier,
      skills,
      postedOn,
      source: "upwork_feed",
      feedHasMoreToggle: hasMore,
      likelyTruncated: hasMore,
    };
  });

  return { jobs, count: jobs.length };
})();
