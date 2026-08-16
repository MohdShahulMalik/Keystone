#!/usr/bin/env bun
/// <reference types="bun-types" />

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TEX_PATH = join(import.meta.dir, "../../../../job-find/new-listings.tex");
const OUTPUT_PATH = join(import.meta.dir, "../data/imported-jobs.json");

interface JobListing {
  title: string;
  company: string;
  location: string;
  url: string | null;
  description: string;
  salary: string | null;
  experience: string;
  visa: string | null;
  type: string;
  country: string | null;
  notes: string | null;
}

function parseTexTable(tableContent: string): string[][] {
  const rows: string[][] = [];
  const lines = tableContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("\\textbf") ||
      trimmed.startsWith("\\hline") ||
      trimmed.startsWith("\\endfirsthead") ||
      trimmed.startsWith("\\endhead") ||
      trimmed.startsWith("\\multicolumn")
    ) {
      continue;
    }

    const cells = trimmed
      .split("&")
      .map((cell) => cell.trim().replace(/\\$/, "").trim());
    if (cells.length >= 4) {
      rows.push(cells);
    }
  }

  return rows;
}

function extractUrl(text: string): string | null {
  const hrefMatch = text.match(/\\href\{([^}]+)\}/);
  if (hrefMatch) return hrefMatch[1];

  const plainMatch = text.match(
    /(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/[\w./-]*)?/i
  );
  return plainMatch ? plainMatch[0] : null;
}

function cleanText(text: string): string {
  return text
    .replace(/\\href\{[^}]+\}\{[^}]+\}/g, "")
    .replace(/\\textbf\{([^}]+)\}/g, "$1")
    .replace(/\\textit\{([^}]+)\}/g, "$1")
    .replace(/\\textasciitilde\{/g, "~")
    .replace(/\\pounds/g, "£")
    .replace(/\\%/g, "%")
    .replace(/\$.*?\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNotes(text: string): string {
  const cleaned = cleanText(text);
  const url = extractUrl(text);
  if (url) {
    return cleaned.replace(url, "").replace(/--/g, "").trim();
  }
  return cleaned;
}

function extractSalary(text: string): string | null {
  const patterns = [
    /\$[\d,.]+K?(?:\/(?:yr|mo|hr))?/g,
    /USD?\s*[\d,.]+K?(?:\/(?:yr|mo|hr))?/g,
    /EUR?\s*[\d,.]+K?(?:\/(?:yr|mo|hr))?/g,
    /£[\d,.]+K?(?:\/(?:yr|mo|hr))?/g,
    /Rs?\s*[\d,.]+L?(?:\/(?:yr|mo|hr))?/g,
    /AED\s*[\d,.]+K?(?:\/mo)?/g,
    /QAR\s*[\d,.]+K?(?:\/mo)?/g,
    /[\d,.]+--[\d,.]+K?\s*(?:USD|EUR|GBP)/g,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function inferCountry(location: string, section: string): string {
  const loc = location.toLowerCase();
  const sec = section.toLowerCase();

  if (loc.includes("usa") || loc.includes("us only") || loc.includes("us-based"))
    return "USA";
  if (loc.includes("uk") || loc.includes("london")) return "UK";
  if (loc.includes("netherlands") || loc.includes("amsterdam"))
    return "Netherlands";
  if (loc.includes("dubai") || loc.includes("uae")) return "UAE";
  if (loc.includes("saudi")) return "Saudi Arabia";
  if (loc.includes("doha") || loc.includes("qatar")) return "Qatar";
  if (loc.includes("malaysia") || loc.includes("kl") || loc.includes("penang"))
    return "Malaysia";
  if (loc.includes("indonesia") || loc.includes("jakarta")) return "Indonesia";
  if (loc.includes("istanbul") || loc.includes("turkey")) return "Turkey";
  if (loc.includes("delhi") || loc.includes("noida") || loc.includes("ncr") || loc.includes("gurgaon"))
    return "India";
  if (loc.includes("bangalore") || loc.includes("india")) return "India";
  if (loc.includes("berlin") || loc.includes("hamburg")) return "Germany";
  if (loc.includes("paris")) return "France";

  if (sec.includes("remote worldwide")) return "Remote";
  if (sec.includes("netherlands")) return "Netherlands";
  if (sec.includes("uae")) return "UAE";
  if (sec.includes("saudi")) return "Saudi Arabia";
  if (sec.includes("qatar")) return "Qatar";
  if (sec.includes("malaysia")) return "Malaysia";
  if (sec.includes("indonesia")) return "Indonesia";
  if (sec.includes("turkey")) return "Turkey";
  if (sec.includes("delhi") || sec.includes("ncr")) return "India";

  return "Remote";
}

function inferType(location: string): string {
  const loc = location.toLowerCase();
  if (loc.includes("remote")) return "remote";
  if (loc.includes("hybrid")) return "hybrid";
  if (loc.includes("onsite") || loc.includes("on-site") || loc.includes("in-office") || loc.includes("in-person"))
    return "onsite";
  return "remote";
}

function parseLatex(texContent: string): JobListing[] {
  const jobs: JobListing[] = [];

  const sectionRegex =
    /\\section\{([^}]+)\}[\s\S]*?\\begin\{longtable\}[\s\S]*?\\end\{longtable\}/g;

  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(texContent)) !== null) {
    const sectionTitle = sectionMatch[1];
    const tableContent = sectionMatch[0];

    const rows = parseTexTable(tableContent);

    for (const row of rows) {
      const [company, role, location, visa, notesRaw] = row;

      if (!company || !role) continue;

      const cleanedCompany = cleanText(company);
      const cleanedRole = cleanText(role);
      const cleanedLocation = cleanText(location);
      const cleanedVisa = cleanText(visa);

      const url = extractUrl(notesRaw || "");
      const notes = extractNotes(notesRaw || "");
      const salary = extractSalary(notesRaw || "");

      const country = inferCountry(cleanedLocation, sectionTitle);
      const type = inferType(cleanedLocation);

      jobs.push({
        title: cleanedRole,
        company: cleanedCompany,
        location: cleanedLocation,
        url,
        description: notes || `${cleanedRole} at ${cleanedCompany}`,
        salary,
        experience: "Entry Level / New Grad",
        visa: cleanedVisa || null,
        type,
        country,
        notes,
      });
    }
  }

  return jobs;
}

async function fetchJobDetails(
  url: string
): Promise<{ description?: string; experience?: string; type?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return {};

    const html = await response.text();

    let description = "";
    const descMeta = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    );
    if (descMeta) {
      description = descMeta[1];
    } else {
      const ogDesc = html.match(
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
      );
      if (ogDesc) description = ogDesc[1];
    }

    let experience = "";
    const expPatterns = [
      /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience/i,
      /experience:\s*(\d+)\+?\s*(?:years?|yrs?)/i,
      /entry[\s-]*level/i,
      /junior/i,
      /senior/i,
      /mid[\s-]*level/i,
      /new\s*grad/i,
      /fresher/i,
    ];

    for (const pattern of expPatterns) {
      const match = html.match(pattern);
      if (match) {
        experience = match[0];
        break;
      }
    }

    let type = "";
    const typePatterns = [
      /remote/i,
      /hybrid/i,
      /onsite|on-site/i,
      /full[\s-]*time/i,
      /part[\s-]*time/i,
      /contract/i,
    ];

    for (const pattern of typePatterns) {
      const match = html.match(pattern);
      if (match) {
        type = match[0];
        break;
      }
    }

    return {
      description: description || undefined,
      experience: experience || undefined,
      type: type || undefined,
    };
  } catch {
    return {};
  }
}

async function main() {
  console.log("Reading LaTeX file...");
  const texContent = readFileSync(TEX_PATH, "utf-8");

  console.log("Parsing job listings...");
  const jobs = parseLatex(texContent);
  console.log(`Found ${jobs.length} listings`);

  console.log("Fetching job details from URLs...");
  const enrichedJobs: JobListing[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    process.stdout.write(
      `\r  [${i + 1}/${jobs.length}] ${job.company} - ${job.title}`
    );

    if (job.url) {
      const details = await fetchJobDetails(job.url);
      if (details.description && details.description.length > job.description.length) {
        job.description = details.description;
      }
      if (details.experience) job.experience = details.experience;
      if (details.type) job.type = details.type.toLowerCase();
    }

    enrichedJobs.push(job);

    if (i < jobs.length - 1) {
      await Bun.sleep(200);
    }
  }

  console.log("\n\nWriting JSON output...");
  writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedJobs, null, 2));
  console.log(`Done! Wrote ${enrichedJobs.length} jobs to ${OUTPUT_PATH}`);
}

main();
