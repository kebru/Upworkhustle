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

  const url = location.href;
  const jobIdMatch = url.match(/~(\d{10,})/);
  // Only treat pages with a /jobs/~<id> as job detail pages.
  if (!jobIdMatch) {
    return { jobText: "", charCount: 0, isJobDetail: false, pageUrl: url };
  }
  const jobUrl = `https://www.upwork.com/jobs/~${jobIdMatch[1]}`;

  // Title
  const titleEl =
    qs('[data-test="job-title"] h2') ||
    qs('h2[class*="job-title"]') ||
    qs("h1");
  const title = text(titleEl);

  // Description
  const descEl =
    qs('[data-test="job-description"]') ||
    qs('[class*="job-description"]') ||
    qs("main article");
  const description = text(descEl);

  // Skills
  const skillEls =
    qsa('[data-test="skills"] [data-test="attr-item"]').length > 0
      ? qsa('[data-test="skills"] [data-test="attr-item"]')
      : qsa('[data-test="token-container"] a[data-test="attr-item"]');
  const skills = skillEls.map((el) => text(el)).filter(Boolean);

  // Metadata from detail sidebar
  const allText = document.body.innerText;

  let budget = "";
  const budgetEl = qs('[data-test="budget"]');
  if (budgetEl) {
    budget = text(budgetEl);
  } else {
    const m = allText.match(/\$[\d,]+(?:\.\d{2})?\s*(?:-\s*\$[\d,]+(?:\.\d{2})?)?/);
    if (m) budget = m[0];
  }

  let duration = "";
  const durationEl = qs('[data-test="duration"]');
  if (durationEl) {
    duration = text(durationEl);
  }

  let jobType = "";
  const jtEl = qs('[data-test="job-type"]');
  if (jtEl) {
    jobType = text(jtEl);
  }

  // Build full job text like user would paste
  const parts = [];
  if (title) parts.push(title);
  if (jobUrl) parts.push(`URL: ${jobUrl}`);
  if (jobType) parts.push(jobType);
  if (budget) parts.push(budget);
  if (duration) parts.push(duration);
  if (description) parts.push(description);
  if (skills.length > 0) parts.push("Skills: " + skills.join(", "));

  const jobText = parts.join("\n\n");

  return {
    jobText,
    title,
    jobUrl,
    budget,
    duration,
    jobType,
    skills,
    source: "upwork_feed",
    charCount: jobText.length,
    isJobDetail: true,
  };
})();
