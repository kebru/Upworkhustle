import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("homepage loads with form", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Job bewerten");
    await expect(page.locator("textarea#job")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText("Jetzt bewerten");
  });

  test("empty submit shows error", async ({ page }) => {
    await page.goto("/");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 });
  });

  test("history page loads", async ({ page }) => {
    await page.goto("/history");
    await expect(page.locator("h1")).toContainText(/Gespeicherte Bewertungen|Keine Einträge/);
  });

  test("health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test("parse endpoint validates input", async ({ request }) => {
    const res = await request.post("/api/parse", {
      data: { rawText: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("evaluate endpoint validates input", async ({ request }) => {
    const res = await request.post("/api/evaluate", {
      data: { jobText: "" },
    });
    expect(res.status()).toBe(400);
  });

  test("navigation works between pages", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="/history"]');
    await expect(page).toHaveURL("/history");
    await page.click('a[href="/"]');
    await expect(page).toHaveURL("/");
  });

  test("textarea accepts text input", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea#job");
    await textarea.fill("Test job description for a landing page build");
    await expect(textarea).toHaveValue("Test job description for a landing page build");
  });
});
