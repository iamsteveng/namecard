// Remove unused React import
import type {
  PersonEnrichmentData,
  CompanyEnrichmentData,
} from '@namecard/shared/types/enrichment.types';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
  Building2,
  Calendar,
  ExternalLink,
  User,
  Briefcase,
  Loader2,
  // AlertCircle, // unused
  Edit3,
  Share,
  Download,
  Trash2,
  Tag,
  Clock,
  TrendingUp,
  Users,
  DollarSign,
  Award,
  Newspaper,
  BookOpen,
  Trophy,
  Target,
  Lightbulb,
  Linkedin,
  Twitter,
  Github,
  Code,
  GraduationCap,
  Mic,
  Star,
  Quote,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Card } from '../../services/cards.service';
import { EnrichmentStatusBadge } from '../enrichment/EnrichmentStatusIndicator';

export interface CardDetailsProps {
  card: Card;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  onEnrich?: () => void;
  isEnriching?: boolean;
  className?: string;
}

// The Card interface already includes enriched data, no need for extension

export default function CardDetails({
  card,
  onEdit,
  onDelete,
  onShare,
  onExport,
  onEnrich,
  isEnriching,
  className,
}: CardDetailsProps) {
  // Helper function to safely access company properties
  const getCompanyProperty = (property: string): unknown => {
    const company = card.companies?.[0];
    if (!company) return undefined;
    
    // Handle junction table structure
    if ('company' in company) {
      return (company as any).company?.[property];
    }
    
    // Direct company object
    return (company as any)?.[property];
  };

  // Get the primary company data (handle junction table structure)
  const primaryCompany: any =
    card.companies?.[0] && 'company' in card.companies[0]
      ? (card.companies[0] as any).company
      : (card.companies?.[0] as any);
  const hasEnrichmentData = primaryCompany && Object.keys(primaryCompany).length > 3;
  const enrichmentScore = Number(getCompanyProperty('overallEnrichmentScore')) || 0;

  // Get enriched data from API response
  const enrichmentData = card.enrichmentData;

  const personData = enrichmentData?.personData;
  const companyData = enrichmentData?.companyData;
  const citations = enrichmentData?.citations || [];

  // Merge company data (prioritize enriched data over basic company data)
  const fullCompanyData = companyData || primaryCompany;

  // Format dates
  const formatDate = (dateString?: string) => {
    if (!dateString) {
      return 'Not available';
    }
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) {
      return 'Not available';
    }
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className={clsx('max-w-4xl mx-auto space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/cards"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Cards
        </Link>

        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Share className="h-4 w-4" />
              Share
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Main Card Information */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-6">
          <div className="flex items-start gap-6">
            {/* Profile Section */}
            <div className="flex-shrink-0">
              {primaryCompany?.logoUrl ? (
                <img
                  src={primaryCompany.logoUrl}
                  alt={`${primaryCompany.name} logo`}
                  className="w-20 h-20 rounded-lg object-contain bg-gray-50 border border-gray-200"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <User className="h-8 w-8 text-gray-400" />
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {card.name || 'Unknown Name'}
                  </h1>
                  <p className="text-lg text-gray-600">{card.title || 'No Title'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <p className="text-gray-700 font-medium">{card.company || 'No Company'}</p>
                    {hasEnrichmentData && (
                      <EnrichmentStatusBadge
                        status={enrichmentScore > 0 ? 'enriched' : 'skipped'}
                        confidence={enrichmentScore}
                        size="sm"
                      />
                    )}
                  </div>
                </div>

                {/* Enrichment Action */}
                {onEnrich && (
                  <button
                    onClick={onEnrich}
                    disabled={isEnriching}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isEnriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    {isEnriching ? 'Enriching...' : 'Enrich Data'}
                  </button>
                )}
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {card.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a
                      href={`mailto:${card.email}`}
                      className="text-blue-600 hover:text-blue-700 truncate"
                    >
                      {card.email}
                    </a>
                  </div>
                )}
                {card.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${card.phone}`} className="text-gray-700 hover:text-gray-900">
                      {card.phone}
                    </a>
                  </div>
                )}
                {card.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <a
                      href={card.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 truncate flex items-center gap-1"
                    >
                      {card.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {card.address && (
                  <div className="flex items-start gap-2 md:col-span-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{card.address}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {card.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  <Tag className="h-4 w-4 text-gray-400 mt-1" />
                  {card.tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Scan Information */}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Scanned {formatDate(card.scanDate)}
                </div>
                {card.confidence && (
                  <div className="flex items-center gap-1">
                    <Award className="h-4 w-4" />
                    {Math.round(card.confidence * 100)}% confidence
                  </div>
                )}
                {card.lastEnrichmentDate && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Enriched {formatDate(card.lastEnrichmentDate)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Basic Company Information */}
      {hasEnrichmentData && primaryCompany && !companyData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Information
            </h2>

            <div className="space-y-6">
              {/* Company Overview */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {getCompanyProperty('industry') && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Industry</span>
                      <p className="text-gray-900">{String(getCompanyProperty('industry'))}</p>
                    </div>
                  )}
                  {getCompanyProperty('size') && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Company Size</span>
                      <p className="text-gray-900">{String(getCompanyProperty('size'))}</p>
                    </div>
                  )}
                  {getCompanyProperty('founded') && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Founded</span>
                      <p className="text-gray-900">{String(getCompanyProperty('founded'))}</p>
                    </div>
                  )}
                  {primaryCompany.employeeCount && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Employees</span>
                      <div className="flex items-center gap-1 text-gray-900">
                        <Users className="h-4 w-4 text-gray-400" />
                        {primaryCompany.employeeCount.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {primaryCompany.annualRevenue && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Revenue</span>
                      <div className="flex items-center gap-1 text-gray-900">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        {primaryCompany.annualRevenue}
                      </div>
                    </div>
                  )}
                  {primaryCompany.headquarters && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Headquarters</span>
                      <div className="flex items-center gap-1 text-gray-900">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        {primaryCompany.headquarters}
                      </div>
                    </div>
                  )}
                </div>

                {primaryCompany.description && (
                  <div className="mt-4">
                    <span className="text-sm font-medium text-gray-500">Description</span>
                    <p className="text-gray-900 mt-1">{primaryCompany.description}</p>
                  </div>
                )}
              </div>

              {/* Technologies */}
              {primaryCompany.technologies && primaryCompany.technologies.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-2">Technologies</span>
                  <div className="flex flex-wrap gap-2">
                    {primaryCompany.technologies.map((tech: string) => (
                      <span
                        key={tech}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {primaryCompany.keywords && primaryCompany.keywords.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500 block mb-2">Keywords</span>
                  <div className="flex flex-wrap gap-2">
                    {primaryCompany.keywords.map((keyword: string) => (
                      <span
                        key={keyword}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Social Media */}
              <div className="flex flex-wrap gap-4">
                {primaryCompany.website && (
                  <a
                    href={primaryCompany.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {primaryCompany.linkedinUrl && (
                  <a
                    href={primaryCompany.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    LinkedIn
                  </a>
                )}
                {primaryCompany.twitterHandle && (
                  <a
                    href={`https://twitter.com/${primaryCompany.twitterHandle.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Twitter
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Person Enrichment Data */}
      {personData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Professional Profile
            </h2>

            <div className="space-y-6">
              {/* Professional Background */}
              {personData.experience && personData.experience.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Work Experience
                  </h3>
                  <div className="space-y-3">
                    {personData.experience.map(
                      (exp: NonNullable<PersonEnrichmentData['experience']>[0], index: number) => (
                        <div key={index} className="border-l-2 border-blue-100 pl-4 py-2">
                          <div className="font-medium text-gray-900">{exp.role}</div>
                          <div className="text-blue-600 font-medium">{exp.company}</div>
                          {exp.duration && (
                            <div className="text-sm text-gray-500">{exp.duration}</div>
                          )}
                          {exp.description && (
                            <div className="text-sm text-gray-700 mt-1">{exp.description}</div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Education */}
              {personData.education && personData.education.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    Education
                  </h3>
                  <div className="space-y-3">
                    {personData.education.map(
                      (edu: NonNullable<PersonEnrichmentData['education']>[0], index: number) => (
                        <div key={index} className="border-l-2 border-green-100 pl-4 py-2">
                          <div className="font-medium text-gray-900">{edu.institution}</div>
                          {edu.degree && <div className="text-green-600">{edu.degree}</div>}
                          {edu.field && <div className="text-sm text-gray-600">{edu.field}</div>}
                          {edu.year && <div className="text-sm text-gray-500">{edu.year}</div>}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Skills and Expertise */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {personData.expertise && personData.expertise.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Expertise
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {personData.expertise.map((skill: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {personData.skills && personData.skills.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Skills
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {personData.skills.map((skill: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Achievements and Recognition */}
              {(personData.achievements || personData.awards || personData.certifications) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Achievements & Recognition
                  </h3>
                  <div className="space-y-4">
                    {personData.achievements && personData.achievements.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Achievements</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {personData.achievements.map((achievement: string, index: number) => (
                            <li key={index} className="text-sm text-gray-600">
                              {achievement}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {personData.awards && personData.awards.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Awards</h4>
                        <div className="space-y-2">
                          {personData.awards.map(
                            (
                              award: NonNullable<PersonEnrichmentData['awards']>[0],
                              index: number
                            ) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg border border-yellow-200"
                              >
                                <div>
                                  <span className="font-medium text-gray-900">{award.title}</span>
                                  {award.organization && (
                                    <span className="text-sm text-gray-600 ml-2">
                                      - {award.organization}
                                    </span>
                                  )}
                                </div>
                                {award.year && (
                                  <span className="text-sm text-gray-500">{award.year}</span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {personData.certifications && personData.certifications.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Certifications</h4>
                        <div className="flex flex-wrap gap-2">
                          {personData.certifications.map((cert: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200"
                            >
                              <Award className="h-3 w-3 mr-1" />
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Publications and Speaking */}
              {(personData.publications || personData.speakingEngagements) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Publications & Speaking
                  </h3>
                  <div className="space-y-4">
                    {personData.publications && personData.publications.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Publications</h4>
                        <div className="space-y-3">
                          {personData.publications.map(
                            (
                              pub: NonNullable<PersonEnrichmentData['publications']>[0],
                              index: number
                            ) => (
                              <div key={index} className="border-l-2 border-indigo-100 pl-4 py-2">
                                <div className="font-medium text-gray-900">{pub.title}</div>
                                {pub.venue && (
                                  <div className="text-sm text-indigo-600">{pub.venue}</div>
                                )}
                                <div className="flex items-center gap-4 mt-1">
                                  {pub.publishDate && (
                                    <span className="text-sm text-gray-500">
                                      {formatDate(pub.publishDate)}
                                    </span>
                                  )}
                                  {pub.url && (
                                    <a
                                      href={pub.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                    >
                                      <LinkIcon className="h-3 w-3" />
                                      View
                                    </a>
                                  )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {personData.speakingEngagements &&
                      personData.speakingEngagements.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Speaking Engagements
                          </h4>
                          <div className="space-y-3">
                            {personData.speakingEngagements.map(
                              (
                                speaking: NonNullable<
                                  PersonEnrichmentData['speakingEngagements']
                                >[0],
                                index: number
                              ) => (
                                <div key={index} className="border-l-2 border-orange-100 pl-4 py-2">
                                  <div className="font-medium text-gray-900">{speaking.event}</div>
                                  {speaking.topic && (
                                    <div className="text-sm text-orange-600">{speaking.topic}</div>
                                  )}
                                  <div className="flex items-center gap-4 mt-1">
                                    {speaking.date && (
                                      <span className="text-sm text-gray-500">
                                        {formatDate(speaking.date)}
                                      </span>
                                    )}
                                    {speaking.url && (
                                      <a
                                        href={speaking.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                      >
                                        <Mic className="h-3 w-3" />
                                        View
                                      </a>
                                    )}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Professional Activities */}
              {(personData.boardMemberships ||
                personData.advisoryRoles ||
                personData.professionalMemberships) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Professional Activities
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {personData.boardMemberships && personData.boardMemberships.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Board Memberships
                        </h4>
                        <ul className="space-y-1">
                          {personData.boardMemberships.map((board: string, index: number) => (
                            <li
                              key={index}
                              className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded"
                            >
                              {board}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {personData.advisoryRoles && personData.advisoryRoles.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Advisory Roles</h4>
                        <ul className="space-y-1">
                          {personData.advisoryRoles.map((role: string, index: number) => (
                            <li
                              key={index}
                              className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded"
                            >
                              {role}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {personData.professionalMemberships &&
                      personData.professionalMemberships.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Memberships</h4>
                          <ul className="space-y-1">
                            {personData.professionalMemberships.map(
                              (membership: string, index: number) => (
                                <li
                                  key={index}
                                  className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded"
                                >
                                  {membership}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Social Media & Online Presence */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Online Presence
                </h3>
                <div className="flex flex-wrap gap-4">
                  {personData.linkedinUrl && (
                    <a
                      href={personData.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </a>
                  )}
                  {personData.twitterHandle && (
                    <a
                      href={`https://twitter.com/${personData.twitterHandle.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                      <Twitter className="h-4 w-4" />
                      Twitter
                    </a>
                  )}
                  {personData.githubUrl && (
                    <a
                      href={personData.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                      <Github className="h-4 w-4" />
                      GitHub
                    </a>
                  )}
                  {personData.personalWebsite && (
                    <a
                      href={personData.personalWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors border border-green-200"
                    >
                      <Globe className="h-4 w-4" />
                      Website
                    </a>
                  )}
                  {personData.blogUrl && (
                    <a
                      href={personData.blogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200"
                    >
                      <FileText className="h-4 w-4" />
                      Blog
                    </a>
                  )}
                </div>
              </div>

              {/* Recent Activities & Thought Leadership */}
              {(personData.recentActivities || personData.thoughtLeadership) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Recent Activities & Insights
                  </h3>
                  <div className="space-y-4">
                    {personData.recentActivities && personData.recentActivities.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Recent Activities
                        </h4>
                        <div className="space-y-3">
                          {personData.recentActivities.map(
                            (
                              activity: NonNullable<PersonEnrichmentData['recentActivities']>[0],
                              index: number
                            ) => (
                              <div
                                key={index}
                                className="p-4 bg-blue-50 rounded-lg border border-blue-200"
                              >
                                <div className="font-medium text-gray-900 mb-2">
                                  {activity.title}
                                </div>
                                <p className="text-sm text-gray-700 mb-2">{activity.description}</p>
                                <div className="flex items-center justify-between text-xs text-gray-500">
                                  <span>{activity.source}</span>
                                  {activity.date && <span>{formatDate(activity.date)}</span>}
                                </div>
                                {activity.url && (
                                  <a
                                    href={activity.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                                  >
                                    <LinkIcon className="h-3 w-3" />
                                    View Details
                                  </a>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {personData.thoughtLeadership && personData.thoughtLeadership.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Thought Leadership
                        </h4>
                        <div className="space-y-2">
                          {personData.thoughtLeadership.map((thought: string, index: number) => (
                            <div
                              key={index}
                              className="p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400"
                            >
                              <Quote className="h-4 w-4 text-yellow-600 mb-2" />
                              <p className="text-sm text-gray-700 italic">"{thought}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {personData.industryInfluence && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Industry Influence
                        </h4>
                        <p className="text-sm text-gray-700 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                          {personData.industryInfluence}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Company Information */}
      {fullCompanyData && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Intelligence
            </h2>

            <div className="space-y-6">
              {/* Recent News and Developments */}
              {companyData?.recentNews && companyData.recentNews.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Newspaper className="h-4 w-4" />
                    Recent News
                  </h3>
                  <div className="space-y-4">
                    {companyData.recentNews.map(
                      (
                        news: NonNullable<CompanyEnrichmentData['recentNews']>[0],
                        index: number
                      ) => (
                        <div
                          key={index}
                          className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <h4 className="font-medium text-gray-900 mb-2">{news.title}</h4>
                          <p className="text-sm text-gray-700 mb-3">{news.summary}</p>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{news.source}</span>
                            {news.publishDate && <span>{formatDate(news.publishDate)}</span>}
                          </div>
                          <a
                            href={news.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 mt-2"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Read Article
                          </a>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Key People */}
              {companyData?.keyPeople && companyData.keyPeople.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Key People
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {companyData.keyPeople.map(
                      (
                        person: NonNullable<CompanyEnrichmentData['keyPeople']>[0],
                        index: number
                      ) => (
                        <div
                          key={index}
                          className="p-4 bg-blue-50 rounded-lg border border-blue-200"
                        >
                          <div className="font-medium text-gray-900">{person.name}</div>
                          <div className="text-sm text-blue-600 font-medium">{person.role}</div>
                          {person.description && (
                            <p className="text-sm text-gray-700 mt-2">{person.description}</p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Market Analysis */}
              {(companyData?.competitors ||
                companyData?.marketPosition ||
                companyData?.businessModel) && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Market Analysis
                  </h3>
                  <div className="space-y-4">
                    {companyData.marketPosition && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Market Position</h4>
                        <p className="text-sm text-gray-700 p-3 bg-green-50 rounded-lg border border-green-200">
                          {companyData.marketPosition}
                        </p>
                      </div>
                    )}

                    {companyData.businessModel && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Business Model</h4>
                        <p className="text-sm text-gray-700 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          {companyData.businessModel}
                        </p>
                      </div>
                    )}

                    {companyData.competitors && companyData.competitors.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Competitors</h4>
                        <div className="flex flex-wrap gap-2">
                          {companyData.competitors.map((competitor: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-50 text-red-700 border border-red-200"
                            >
                              {competitor}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Developments */}
              {companyData?.recentDevelopments && companyData.recentDevelopments.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Recent Developments
                  </h3>
                  <ul className="space-y-2">
                    {companyData.recentDevelopments.map((development: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{development}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Research Citations */}
      {citations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Research Sources & Citations
            </h2>

            <div className="space-y-3">
              {citations.map((citation: any, index: number) => (
                <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">{citation.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">{citation.source}</p>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                          Accessed: {formatDate(citation.accessDate)}
                        </span>
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                            citation.category === 'person'
                              ? 'bg-blue-100 text-blue-700'
                              : citation.category === 'company'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-purple-100 text-purple-700'
                          )}
                        >
                          {citation.category}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Relevance:</span>
                          <div className="flex items-center">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={clsx(
                                  'h-3 w-3',
                                  i < Math.round(citation.relevance * 5)
                                    ? 'text-yellow-400 fill-current'
                                    : 'text-gray-300'
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Research Metadata */}
            {enrichmentData?.researchQuery && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-gray-900 mb-2">Research Query</h4>
                <p className="text-sm text-gray-700 font-mono bg-white px-3 py-2 rounded border">
                  {enrichmentData.researchQuery}
                </p>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                  {enrichmentData.researchDate && (
                    <span>Research Date: {formatDate(enrichmentData.researchDate.toString())}</span>
                  )}
                  <div className="flex items-center gap-4">
                    {enrichmentData.personConfidence && (
                      <span>
                        Person Confidence: {Math.round(enrichmentData.personConfidence * 100)}%
                      </span>
                    )}
                    {enrichmentData.companyConfidence && (
                      <span>
                        Company Confidence: {Math.round(enrichmentData.companyConfidence * 100)}%
                      </span>
                    )}
                    {enrichmentData.overallConfidence && (
                      <span className="font-medium">
                        Overall: {Math.round(enrichmentData.overallConfidence * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enrichment Status */}
      {card.enrichments && card.enrichments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Enrichment History
            </h2>

            <div className="space-y-3">
              {card.enrichments.map(enrichment => (
                <div
                  key={enrichment.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <EnrichmentStatusBadge
                      status={enrichment.status as any}
                      confidence={enrichment.confidence}
                      size="sm"
                    />
                    <div>
                      <span className="font-medium text-gray-900 capitalize">
                        {enrichment.enrichmentType} Enrichment
                      </span>
                      {enrichment.companiesFound > 0 && (
                        <p className="text-sm text-gray-600">
                          {enrichment.companiesFound} companies found, {enrichment.dataPointsAdded}{' '}
                          data points added
                        </p>
                      )}
                    </div>
                  </div>
                  {enrichment.enrichedAt && (
                    <span className="text-sm text-gray-500">
                      {formatDateTime(enrichment.enrichedAt)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Events */}
      {card.calendarEvents && card.calendarEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Related Calendar Events
            </h2>

            <div className="space-y-3">
              {card.calendarEvents.map(event => (
                <div key={event.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{event.title}</h3>
                      {event.location && (
                        <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </p>
                      )}
                      {event.attendees.length > 0 && (
                        <p className="text-sm text-gray-600 mt-1">
                          {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {event.eventDate && (
                        <p className="text-sm text-gray-600">{formatDateTime(event.eventDate)}</p>
                      )}
                      <span className="text-xs text-gray-500 capitalize">{event.source}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {card.notes && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{card.notes}</p>
          </div>
        </div>
      )}

      {/* No Enrichment Data State */}
      {!hasEnrichmentData && onEnrich && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <TrendingUp className="h-12 w-12 text-yellow-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-yellow-900 mb-2">No Enrichment Data Available</h3>
          <p className="text-yellow-700 mb-4">
            Enrich this card to get additional company information, recent news, and insights.
          </p>
          <button
            onClick={onEnrich}
            disabled={isEnriching}
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isEnriching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            {isEnriching ? 'Enriching...' : 'Enrich This Card'}
          </button>
        </div>
      )}
    </div>
  );
}
