import { ExternalLink, Building, MapPin, Users, Calendar, DollarSign, Tag, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { CompanyInfoProps } from '../../types/enrichment.types';
import type { CompanyEnrichmentData } from '@namecard/shared/types/enrichment.types';
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

export default function CompanyInfo({
  companyData,
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

  if (!companyData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-6">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Company Data Available</h3>
          <p className="mt-1 text-sm text-gray-500">
            Enrich this card to get detailed company information
          </p>
          {showEnrichButton && onEnrich && (
            <div className="mt-4">
              <button
                onClick={onEnrich}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Building className="h-4 w-4" />
                Get Company Info
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Company Information</h3>
        {companyData.confidence && (
          <span className={clsx(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            companyData.confidence >= 0.9 ? 'text-green-700 bg-green-100' :
            companyData.confidence >= 0.7 ? 'text-yellow-700 bg-yellow-100' :
            'text-red-700 bg-red-100'
          )}>
            {Math.round(companyData.confidence * 100)}% confidence
          </span>
        )}
      </div>

      <CompanyLogo logoUrl={companyData.logoUrl} companyName={companyData.name} />

      <div className="space-y-4">
        <CompanyField
          label="Company Name"
          value={companyData.name}
          icon={<Building className="h-4 w-4" />}
        />

        <CompanyField
          label="Website"
          value={companyData.website}
          icon={<ExternalLink className="h-4 w-4" />}
          type="url"
        />

        <CompanyField
          label="Industry"
          value={companyData.industry}
          icon={<Tag className="h-4 w-4" />}
        />

        <CompanyField
          label="Description"
          value={companyData.description}
          icon={<Building className="h-4 w-4" />}
        />

        <CompanyField
          label="Location"
          value={companyData.headquarters || companyData.location}
          icon={<MapPin className="h-4 w-4" />}
        />

        <CompanyField
          label="Company Size"
          value={companyData.employeeCount ? `${companyData.employeeCount} employees` : companyData.size}
          icon={<Users className="h-4 w-4" />}
        />

        <CompanyField
          label="Founded"
          value={companyData.founded}
          icon={<Calendar className="h-4 w-4" />}
        />

        <CompanyField
          label="Annual Revenue"
          value={companyData.annualRevenue}
          icon={<DollarSign className="h-4 w-4" />}
        />

        <CompanyField
          label="Funding"
          value={companyData.funding}
          icon={<DollarSign className="h-4 w-4" />}
        />

        <CompanyField
          label="Technologies"
          value=""
          icon={<Tag className="h-4 w-4" />}
          type="array"
          arrayValues={companyData.technologies}
        />

        <CompanyField
          label="Keywords"
          value=""
          icon={<Tag className="h-4 w-4" />}
          type="array"
          arrayValues={companyData.keywords}
        />

        {/* Social Media Links */}
        {(companyData.linkedinUrl || companyData.twitterHandle || companyData.facebookUrl) && (
          <div className="pt-4 border-t border-gray-200">
            <div className="text-sm font-medium text-gray-500 mb-3">Social Media</div>
            <div className="space-y-2">
              {companyData.linkedinUrl && (
                <CompanyField
                  label="LinkedIn"
                  value={companyData.linkedinUrl}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
              {companyData.twitterHandle && (
                <CompanyField
                  label="Twitter"
                  value={`https://twitter.com/${companyData.twitterHandle}`}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
              {companyData.facebookUrl && (
                <CompanyField
                  label="Facebook"
                  value={companyData.facebookUrl}
                  icon={<ExternalLink className="h-4 w-4" />}
                  type="url"
                />
              )}
            </div>
          </div>
        )}

        {/* Last Updated */}
        {companyData.lastUpdated && (
          <div className="pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Last updated: {new Date(companyData.lastUpdated).toLocaleDateString()}
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
  );
}