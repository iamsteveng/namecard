import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract';

export interface TextractLine {
  text: string;
  confidence: number;
}

export interface BusinessCardExtraction {
  rawText: string;
  lines: TextractLine[];
  name?: string;
  jobTitle?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  confidence: number;
}

interface ExtractOptions {
  minConfidence?: number;
}

let textractClient: TextractClient | null = null;

const resolveRegion = () => process.env['TEXTRACT_REGION'] ?? process.env['AWS_REGION'] ?? 'us-east-1';

const getTextractClient = () => {
  if (!textractClient) {
    textractClient = new TextractClient({ region: resolveRegion() });
  }
  return textractClient;
};

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRegex = /\+?\d[\d\s().-]{6,}\d/;
const websiteRegex = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/i;
const addressIndicators = /(suite|st\.?|street|ave\.?|avenue|road|rd\.?|drive|dr\.?|floor|fl\.?|blvd\.?|boulevard|city|state|zip|\d{5})/i;
const jobKeywordRegex = /(chief|director|manager|vp|president|consultant|officer|executive|lead|head|founder|engineer|designer|marketing|sales|product|partnerships|strategy|operations)/i;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const scoreUppercaseRatio = (value: string): number => {
  if (!value) {
    return 0;
  }
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (!letters) {
    return 0;
  }
  const uppercase = letters.replace(/[a-z]/g, '');
  return uppercase.length / letters.length;
};

const looksLikeName = (value: string): boolean => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    return false;
  }
  return words.every(word => /^(?:[A-Z][a-z]+|[A-Z][a-z]+-[A-Z][a-z]+)$/.test(word));
};

const looksLikeCompany = (value: string): boolean => {
  const hasCompanyKeyword = /(inc\.?|llc|co\.?|corp\.?|company|solutions|labs|group|technologies|analytics|studio|partners|systems|enterprise)/i.test(
    value
  );
  return hasCompanyKeyword || scoreUppercaseRatio(value) > 0.6;
};

const pickBestMatch = (lines: TextractLine[], predicate: (value: string) => boolean) => {
  let best: TextractLine | null = null;
  for (const line of lines) {
    if (!predicate(line.text)) {
      continue;
    }
    if (!best || line.confidence > best.confidence) {
      best = line;
    }
  }
  return best ?? undefined;
};

const deriveEmail = (rawText: string) => rawText.match(emailRegex)?.[0];

const derivePhone = (rawText: string) => rawText.match(phoneRegex)?.[0];

const deriveWebsite = (rawText: string) => rawText.match(websiteRegex)?.[0];

const deriveAddress = (lines: TextractLine[]) => {
  const candidate = lines.find(line => addressIndicators.test(line.text));
  return candidate?.text;
};

const deriveJobTitle = (lines: TextractLine[], nameLine?: TextractLine) => {
  if (!nameLine) {
    return pickBestMatch(lines, value => jobKeywordRegex.test(value));
  }

  const nameIndex = lines.findIndex(line => line.text === nameLine.text);
  if (nameIndex === -1) {
    return pickBestMatch(lines, value => jobKeywordRegex.test(value));
  }

  const neighbours = lines.slice(Math.max(0, nameIndex - 1), Math.min(lines.length, nameIndex + 3));
  return neighbours.find(line => jobKeywordRegex.test(line.text));
};

const deriveCompany = (
  lines: TextractLine[],
  nameLine?: TextractLine,
  jobTitleLine?: TextractLine
) => {
  const excluded = new Set<string>();
  if (nameLine) excluded.add(nameLine.text);
  if (jobTitleLine) excluded.add(jobTitleLine.text);

  const candidates = lines.filter(line => !excluded.has(line.text));

  const keywordCandidate = pickBestMatch(candidates, looksLikeCompany);
  if (keywordCandidate) {
    return keywordCandidate;
  }

  const bestByUppercase = [...candidates].sort(
    (a, b) => scoreUppercaseRatio(b.text) - scoreUppercaseRatio(a.text)
  )[0];
  return bestByUppercase;
};

const pickName = (lines: TextractLine[]) => pickBestMatch(lines, looksLikeName);

export const extractBusinessCardData = async (
  image: Buffer,
  options: ExtractOptions = {}
): Promise<BusinessCardExtraction> => {
  if (!image || image.length === 0) {
    throw new Error('Uploaded image is empty.');
  }

  if (image.length > 5 * 1024 * 1024) {
    throw new Error('Uploaded image exceeds 5MB Textract limit.');
  }

  const client = getTextractClient();
  const command = new DetectDocumentTextCommand({
    Document: {
      Bytes: image,
    },
  });

  const response = await client.send(command);

  const thresholdRaw = options.minConfidence ?? 70;
  const confidenceThreshold = (() => {
    if (Number.isNaN(thresholdRaw)) {
      return 0.5;
    }
    if (thresholdRaw > 1) {
      return Math.min(1, Math.max(0, thresholdRaw / 100));
    }
    if (thresholdRaw < 0) {
      return 0;
    }
    return thresholdRaw;
  })();
  const lines: TextractLine[] = (response.Blocks ?? [])
    .filter(block => block.BlockType === 'LINE' && (block.Text ?? '').trim())
    .map(block => ({
      text: normalizeWhitespace(block.Text ?? ''),
      confidence: Math.min(1, Math.max(0, (block.Confidence ?? 0) / 100)),
    }))
    .filter(line => line.confidence >= confidenceThreshold)
    .map(line => ({
      text: line.text,
      confidence: Number(line.confidence.toFixed(4)),
    }));

  if (lines.length === 0) {
    throw new Error('Textract did not return any readable text for the uploaded image.');
  }

  const rawText = lines.map(line => line.text).join('\n');

  const nameLine = pickName(lines);
  const jobTitleLine = deriveJobTitle(lines, nameLine);
  const companyLine = deriveCompany(lines, nameLine, jobTitleLine);

  const email = deriveEmail(rawText) ?? undefined;
  const phone = derivePhone(rawText) ?? undefined;
  const websiteRaw = deriveWebsite(rawText) ?? undefined;
  const website = websiteRaw
    ? websiteRaw.startsWith('http')
      ? websiteRaw
      : `https://${websiteRaw.replace(/^https?:\/\//i, '')}`
    : undefined;
  const address = deriveAddress(lines) ?? undefined;

  const averageConfidence =
    lines.reduce((total, line) => total + line.confidence, 0) / lines.length;

  return {
    rawText,
    lines,
    name: nameLine?.text,
    jobTitle: jobTitleLine?.text,
    company: companyLine?.text,
    email,
    phone,
    website,
    address,
    confidence: Number(averageConfidence.toFixed(2)),
  };
};
