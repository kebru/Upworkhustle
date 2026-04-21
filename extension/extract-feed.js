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

  const tiles = qsa('section.air3-card-section[data-ev-opening_uid]');
  if (tiles.length === 0) {
    const fallback = qsa('[data-test="job-tile-list"] section');
    if (fallback.length > 0) tiles.push(...fallback);
  }

  const jobs = tiles.map((tile) => {
    const titleEl = qs("h3.job-tile-title a", tile) || qs("h3 a", tile);
    const title = text(titleEl);
    const href = titleEl?.getAttribute("href") || "";
    const jobUrl = href.startsWith("http") ? href : href ? `https://www.upwork.com${href}` : "";

    const descEl = qs('[data-test="job-description-text"]', tile);
    const description = text(descEl);

    const skillEls = qsa('[data-test="token-container"] a[data-test="attr-item"]', tile);
    const skills = skillEls.map((el) => text(el)).filter(Boolean);

    const postedOn = text(qs('[data-test="posted-on"]', tile));
    const budget = text(qs('[data-test="budget"]', tile));
    const duration = text(qs('[data-test="duration"]', tile));
    const jobType = text(qs('[data-test="job-type"]', tile));
    const contractorTier = text(qs('[data-test="contractor-tier"]', tile));

    const hasMore = !!qs('[data-test="job-description-line-clamp"]', tile);

    const parts = [];
    if (title) parts.push(title);
    if (jobType) parts.push(jobType);
    if (budget) parts.push(budget);
    if (duration) parts.push(duration);
    if (description) parts.push(description);
    if (skills.length > 0) parts.push("Skills: " + skills.join(", "));

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
