'use client';

import { Document, Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';
import type { ReportContent } from '@/lib/types';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1f2937',
  },
  header: {
    marginBottom: 24,
    borderBottom: '2px solid #801872',
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#361455',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#969696',
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
    padding: 12,
    border: '1px solid #e5e7eb',
  },
  metricLabel: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  alertGreen: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
  },
  alertAmber: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
  },
  alertRed: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#361455',
    marginBottom: 6,
  },
  body: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#374151',
  },
  listItem: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#374151',
    marginLeft: 8,
  },
  citedLink: {
    color: '#801872',
    textDecoration: 'underline',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
  },
});

interface ReportPDFProps {
  content: ReportContent;
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
}

function AlertLevelBadge({ level }: { level: string }) {
  const alertMap: Record<string, { style: typeof styles.alertGreen; text: string }> = {
    green: { style: styles.alertGreen, text: 'GREEN' },
    yellow: { style: styles.alertAmber, text: 'AMBER' },
    red: { style: styles.alertRed, text: 'RED' },
  };

  const config = alertMap[level] ?? alertMap.green;

  return <Text style={config.style}>{config.text}</Text>;
}

function trendLabel(trend: string): string {
  const labels: Record<string, string> = {
    improving: 'Improving',
    stable: 'Stable',
    worsening: 'Worsening',
  };
  return labels[trend] ?? trend;
}

export function ReportPDF({ content, generatedAt, weekStart, weekEnd }: ReportPDFProps) {
  const notableVoices = content.notable_voices ?? [];
  const sourcesReviewed = content.sources_reviewed ?? [];
  const citedArticles = content.cited_articles ?? [];
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {content.client_name} — {content.site_name}
          </Text>
          <Text style={styles.subtitle}>
            Weekly Media Monitoring Report | {new Date(weekStart).toLocaleDateString('en-GB')} –{' '}
            {new Date(weekEnd).toLocaleDateString('en-GB')}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Coverage volume</Text>
            <Text style={styles.metricValue}>{content.coverage_volume}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Sentiment trend</Text>
            <Text style={styles.metricValue}>{trendLabel(content.sentiment_trend)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Alert level</Text>
            <AlertLevelBadge level={content.alert_level} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key developments</Text>
          <Text style={styles.body}>{content.key_developments}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notable voices</Text>
          <Text style={styles.body}>
            {notableVoices.length > 0
              ? notableVoices.join(', ')
              : 'None identified this week'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items requiring action</Text>
          <Text style={styles.body}>{content.items_requiring_action}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sources reviewed</Text>
          {sourcesReviewed.map((source, i) => (
            <Text key={i} style={styles.listItem}>
              • {source}
            </Text>
          ))}
        </View>

        {citedArticles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cited articles</Text>
            {citedArticles.map((article, i) => (
              <Text key={i} style={styles.listItem}>
                •{' '}
                {article.url ? (
                  <Link src={article.url} style={styles.citedLink}>
                    {article.summary}
                  </Link>
                ) : (
                  article.summary
                )}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>DevComms Media Monitor</Text>
          <Text style={styles.footerText}>
            Generated {new Date(generatedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
