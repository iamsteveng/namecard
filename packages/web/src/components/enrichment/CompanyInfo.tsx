import { 
  ExternalLink, Building, MapPin, Users, Calendar, DollarSign, Tag, Loader2, 
  User, Award, BookOpen, TrendingUp, Globe, MessageSquare, News, Shield,
  GraduationCap, Briefcase, Star, Link, Quote
} from 'lucide-react';
import { clsx } from 'clsx';
import type { CompanyInfoProps } from '../../types/enrichment.types';
import type { 
  CompanyEnrichmentData, 
  PersonEnrichmentData, 
  BusinessCardEnrichmentData 
} from '@namecard/shared/types/enrichment.types';
import EnrichmentButton from './EnrichmentButton';

interface CompanyFieldProps {
  label: string;
  value?: string | number;
  icon: React.ReactNode;
  type?: 'text' | 'url' | 'array';
  arrayValues?: string[];
}

function CompanyField({ label, value, icon, type = 'text', arrayValues }: CompanyFieldProps) {
  if (!value && !arrayValues?.length) return null;

  const renderValue = () => {
    if (type === 'url' && value) {
      return (
        <a
          href={value as string}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
        >
          {value}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }

    if (type === 'array' && arrayValues?.length) {
      return (
        <div className="flex flex-wrap gap-1">
          {arrayValues.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {item}
            </span>
          ))}
        </div>
      );
    }

    return <span>{value}</span>;
  };

  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-500">{label}</div>
        <div className="text-sm text-gray-900 break-words">
          {renderValue()}
        </div>
      </div>
    </div>
  );
}

function CompanyLogo({ logoUrl, companyName }: { logoUrl?: string; companyName?: string }) {
  if (!logoUrl) return null;

  return (
    <div className="flex justify-center mb-4">
      <img
        src={logoUrl}
        alt={`${companyName} logo`}
        className="h-16 w-16 object-contain rounded-lg border border-gray-200"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}

function ConfidenceScore({ confidence }: { confidence?: number }) {
  if (!confidence) return null;

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.9) return 'text-green-700 bg-green-100';
    if (conf >= 0.7) return 'text-yellow-700 bg-yellow-100';
    return 'text-red-700 bg-red-100';
  };

  return (
    <div className="flex justify-between items-center mb-4">
      <span className="text-sm text-gray-500">Enrichment Confidence</span>
      <span className={clsx(
        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
        getConfidenceColor(confidence)
      )}>
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

function PersonInfo({ personData }: { personData: PersonEnrichmentData }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <User className="h-5 w-5 text-blue-600" />
        <h4 className="text-lg font-medium text-gray-900">Person Information</h4>
        {personData.confidence && (
          <span className={clsx(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ml-auto',
            personData.confidence >= 0.9 ? 'text-green-700 bg-green-100' :
            personData.confidence >= 0.7 ? 'text-yellow-700 bg-yellow-100' :
            'text-red-700 bg-red-100'
          )}>
            {Math.round(personData.confidence * 100)}% confidence
          </span>
        )}
      </div>

      <div className="space-y-3">
        <CompanyField
          label="Name"
          value={personData.name}
          icon={<User className="h-4 w-4" />}
        />
        
        <CompanyField
          label="Title"
          value={personData.title}
          icon={<Briefcase className="h-4 w-4" />}
        />

        <CompanyField
          label="Current Role"
          value={personData.currentRole}
          icon={<Briefcase className="h-4 w-4" />}
        />

        {/* Education */}
        {personData.education && personData.education.length > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Education</span>
            </div>
            <div className="space-y-2">
              {personData.education.map((edu, index) => (
                <div key={index} className="text-sm text-gray-700">
                  <strong>{edu.institution}</strong>
                  {edu.degree && <span> - {edu.degree}</span>}
                  {edu.field && <span> in {edu.field}</span>}
                  {edu.year && <span> ({edu.year})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Experience */}
        {personData.experience && personData.experience.length > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Experience</span>
            </div>
            <div className="space-y-3">
              {personData.experience.slice(0, 5).map((exp, index) => (
                <div key={index} className="text-sm">
                  <div className="font-medium text-gray-900">{exp.role} at {exp.company}</div>
                  {exp.duration && <div className="text-gray-500">{exp.duration}</div>}
                  {exp.description && <div className="text-gray-700 mt-1">{exp.description}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expertise & Skills */}
        {(personData.expertise?.length || personData.skills?.length) && (
          <div className="pt-3 border-t border-gray-200">
            {personData.expertise?.length && (
              <CompanyField
                label="Expertise"
                value=""
                icon={<Star className="h-4 w-4" />}
                type="array"
                arrayValues={personData.expertise}
              />
            )}
            {personData.skills?.length && (
              <div className="mt-3">
                <CompanyField
                  label="Skills"
                  value=""
                  icon={<Award className="h-4 w-4" />}
                  type="array"
                  arrayValues={personData.skills}
                />
              </div>
            )}
          </div>
        )}

        {/* Achievements */}
        {personData.achievements && personData.achievements.length > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Achievements</span>
            </div>
            <div className="space-y-1">
              {personData.achievements.slice(0, 5).map((achievement, index) => (
                <div key={index} className="text-sm text-gray-700">• {achievement}</div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activities */}
        {personData.recentActivities && personData.recentActivities.length > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Recent Activities</span>
            </div>
            <div className="space-y-2">
              {personData.recentActivities.slice(0, 3).map((activity, index) => (
                <div key={index} className="text-sm">
                  <div className="font-medium text-gray-900">{activity.title}</div>
                  <div className="text-gray-700">{activity.description}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {activity.date && <span>{activity.date}</span>}
                    <span>Source: {activity.source}</span>
                    {activity.url && (
                      <a href={activity.url} target="_blank" rel="noopener noreferrer" 
                         className="text-blue-600 hover:text-blue-800">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social Media */}
        {(personData.linkedinUrl || personData.twitterHandle || personData.personalWebsite || personData.githubUrl) && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500">Online Presence</span>
            </div>
            <div className="space-y-2">
              {personData.linkedinUrl && (
                <CompanyField
                  label="LinkedIn"
                  value={personData.linkedinUrl}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
              {personData.twitterHandle && (
                <CompanyField
                  label="Twitter"
                  value={`https://twitter.com/${personData.twitterHandle}`}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
              {personData.personalWebsite && (
                <CompanyField
                  label="Personal Website"
                  value={personData.personalWebsite}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
              {personData.githubUrl && (
                <CompanyField
                  label="GitHub"
                  value={personData.githubUrl}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentNews({ news }: { news: Array<{ title: string; summary: string; url: string; publishDate?: string; source: string }> }) {
  if (!news || news.length === 0) return null;

  return (
    <div className="bg-blue-50 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <News className="h-5 w-5 text-blue-600" />
        <h4 className="text-lg font-medium text-gray-900">Recent News</h4>
      </div>
      
      <div className="space-y-4">
        {news.slice(0, 3).map((article, index) => (
          <div key={index} className="border-b border-blue-200 last:border-b-0 pb-3 last:pb-0">
            <div className="font-medium text-gray-900 mb-1">{article.title}</div>
            <div className="text-sm text-gray-700 mb-2">{article.summary}</div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{article.source}</span>
              {article.publishDate && <span>• {article.publishDate}</span>}
              <a 
                href={article.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                Read more <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CitationsList({ citations }: { citations: Array<{ url: string; title: string; source: string; category: string; relevance: number }> }) {
  if (!citations || citations.length === 0) return null;

  const sortedCitations = [...citations]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 8); // Show top 8 citations

  return (
    <div className="bg-yellow-50 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Quote className="h-5 w-5 text-yellow-600" />
        <h4 className="text-lg font-medium text-gray-900">Research Citations</h4>
        <span className="text-xs text-gray-500 ml-auto">{citations.length} sources</span>
      </div>
      
      <div className="space-y-2">
        {sortedCitations.map((citation, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className="flex-shrink-0 w-6 h-6 bg-yellow-200 text-yellow-800 rounded-full flex items-center justify-center text-xs font-medium">
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <a 
                href={citation.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 truncate block"
                title={citation.title}
              >
                {citation.title}
              </a>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>{citation.source}</span>
                <span className={clsx(
                  'px-1.5 py-0.5 rounded text-xs font-medium',
                  citation.category === 'person' ? 'bg-green-100 text-green-800' :
                  citation.category === 'company' ? 'bg-blue-100 text-blue-800' :
                  'bg-purple-100 text-purple-800'
                )}>
                  {citation.category}
                </span>
                <span>Relevance: {Math.round(citation.relevance * 100)}%</span>
              </div>
            </div>
            <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyInfo({
  companyData,
  personData,
  enrichmentData,
  isLoading = false,
  onEnrich,
  showEnrichButton = true
}: CompanyInfoProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading company information...</span>
        </div>
      </div>
    );
  }

  // Handle unified enrichment data or legacy individual data
  const actualCompanyData = enrichmentData?.companyData || companyData;
  const actualPersonData = enrichmentData?.personData || personData;

  if (!actualCompanyData && !actualPersonData && !enrichmentData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-6">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Enrichment Data Available</h3>
          <p className="mt-1 text-sm text-gray-500">
            Enrich this card to get detailed company and person information
          </p>
          {showEnrichButton && onEnrich && (
            <div className="mt-4">
              <button
                onClick={onEnrich}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Building className="h-4 w-4" />
                Get Enriched Data
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Determine the best confidence score to show
  const displayConfidence = enrichmentData?.overallConfidence || actualCompanyData?.confidence;
  const hasAIData = enrichmentData?.citations && enrichmentData.citations.length > 0;

  return (
    <div className="space-y-6">
      {/* Show Person Information if available */}
      {actualPersonData && <PersonInfo personData={actualPersonData} />}

      {/* Show Recent News if available */}
      {actualCompanyData?.recentNews && actualCompanyData.recentNews.length > 0 && (
        <RecentNews news={actualCompanyData.recentNews} />
      )}

      {/* Show Citations if available */}
      {enrichmentData?.citations && enrichmentData.citations.length > 0 && (
        <CitationsList citations={enrichmentData.citations} />
      )}

      {/* Main Company Information Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" />
            Company Information
            {hasAIData && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                AI Enhanced
              </span>
            )}
          </h3>
          {displayConfidence && (
            <span className={clsx(
              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
              displayConfidence >= 0.9 ? 'text-green-700 bg-green-100' :
              displayConfidence >= 0.7 ? 'text-yellow-700 bg-yellow-100' :
              'text-red-700 bg-red-100'
            )}>
              {Math.round(displayConfidence * 100)}% confidence
            </span>
          )}
        </div>

        <CompanyLogo logoUrl={actualCompanyData?.logoUrl} companyName={actualCompanyData?.name} />

        <div className="space-y-4">
          <CompanyField
            label="Company Name"
            value={actualCompanyData?.name}
            icon={<Building className="h-4 w-4" />}
          />

          <CompanyField
            label="Website"
            value={actualCompanyData?.website}
            icon={<ExternalLink className="h-4 w-4" />}
            type="url"
          />

          <CompanyField
            label="Industry"
            value={actualCompanyData?.industry}
            icon={<Tag className="h-4 w-4" />}
          />

          <CompanyField
            label="Description"
            value={actualCompanyData?.description}
            icon={<Building className="h-4 w-4" />}
          />

          <CompanyField
            label="Location"
            value={actualCompanyData?.headquarters || actualCompanyData?.location}
            icon={<MapPin className="h-4 w-4" />}
          />

          <CompanyField
            label="Company Size"
            value={actualCompanyData?.employeeCount ? `${actualCompanyData.employeeCount} employees` : actualCompanyData?.size}
            icon={<Users className="h-4 w-4" />}
          />

          <CompanyField
            label="Founded"
            value={actualCompanyData?.founded}
            icon={<Calendar className="h-4 w-4" />}
          />

          <CompanyField
            label="Annual Revenue"
            value={actualCompanyData?.annualRevenue}
            icon={<DollarSign className="h-4 w-4" />}
          />

          <CompanyField
            label="Funding"
            value={actualCompanyData?.funding}
            icon={<DollarSign className="h-4 w-4" />}
          />

          {/* AI Enhanced Information */}
          {actualCompanyData?.businessModel && (
            <CompanyField
              label="Business Model"
              value={actualCompanyData.businessModel}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          )}

          {actualCompanyData?.marketPosition && (
            <CompanyField
              label="Market Position"
              value={actualCompanyData.marketPosition}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          )}

          <CompanyField
            label="Technologies"
            value=""
            icon={<Tag className="h-4 w-4" />}
            type="array"
            arrayValues={actualCompanyData?.technologies}
          />

          {actualCompanyData?.competitors && actualCompanyData.competitors.length > 0 && (
            <CompanyField
              label="Competitors"
              value=""
              icon={<Shield className="h-4 w-4" />}
              type="array"
              arrayValues={actualCompanyData.competitors}
            />
          )}

          <CompanyField
            label="Keywords"
            value=""
            icon={<Tag className="h-4 w-4" />}
            type="array"
            arrayValues={actualCompanyData?.keywords}
          />

          {/* Key People Section */}
          {actualCompanyData?.keyPeople && actualCompanyData.keyPeople.length > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Key People</span>
              </div>
              <div className="space-y-2">
                {actualCompanyData.keyPeople.slice(0, 5).map((person, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-medium text-gray-900">{person.name}</span>
                    <span className="text-gray-500"> - {person.role}</span>
                    {person.description && (
                      <div className="text-gray-700 text-xs mt-1">{person.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Developments */}
          {actualCompanyData?.recentDevelopments && actualCompanyData.recentDevelopments.length > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Recent Developments</span>
              </div>
              <div className="space-y-1">
                {actualCompanyData.recentDevelopments.slice(0, 5).map((development, index) => (
                  <div key={index} className="text-sm text-gray-700">• {development}</div>
                ))}
              </div>
            </div>
          )}

          {/* Social Media Links */}
          {(actualCompanyData?.linkedinUrl || actualCompanyData?.twitterHandle || actualCompanyData?.facebookUrl) && (
            <div className="pt-4 border-t border-gray-200">
              <div className="text-sm font-medium text-gray-500 mb-3">Social Media</div>
              <div className="space-y-2">
                {actualCompanyData.linkedinUrl && (
                  <CompanyField
                    label="LinkedIn"
                    value={actualCompanyData.linkedinUrl}
                    icon={<ExternalLink className="h-4 w-4" />}
                    type="url"
                  />
                )}
                {actualCompanyData.twitterHandle && (
                  <CompanyField
                    label="Twitter"
                    value={`https://twitter.com/${actualCompanyData.twitterHandle}`}
                    icon={<ExternalLink className="h-4 w-4" />}
                    type="url"
                  />
                )}
                {actualCompanyData.facebookUrl && (
                  <CompanyField
                    label="Facebook"
                    value={actualCompanyData.facebookUrl}
                    icon={<ExternalLink className="h-4 w-4" />}
                    type="url"
                  />
                )}
              </div>
            </div>
          )}

          {/* Research Metadata */}
          {enrichmentData?.researchDate && (
            <div className="pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span>AI Research Date: {new Date(enrichmentData.researchDate).toLocaleDateString()}</span>
                {enrichmentData.citations && (
                  <span>• {enrichmentData.citations.length} citations</span>
                )}
              </div>
            </div>
          )}

          {/* Last Updated */}
          {actualCompanyData?.lastUpdated && (
            <div className="pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500">
                Last updated: {new Date(actualCompanyData.lastUpdated).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Refresh Button */}
          {showEnrichButton && onEnrich && (
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={onEnrich}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Building className="h-4 w-4" />
                Refresh Data
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}