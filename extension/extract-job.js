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
  const upworkJobId = jobIdMatch[1];
  const jobUrl = `https://www.upwork.com/jobs/~${upworkJobId}`;

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

  const capturedAt = new Date().toISOString();

  return {
    upworkJobId,
    title,
    jobUrl,
    description,
    budget,
    duration,
    jobType,
    skills,
    source: "extension_job_detail",
    capturedAt,
    charCount: (title || description || "").length,
    isJobDetail: true,
  };
})();
