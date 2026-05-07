/**
 * Monitoring Dashboard Screen
 * Admin-only view for production monitoring
 *
 * Shows:
 * - System health status
 * - Performance metrics
 * - Cache statistics
 * - Rate limiting status
 * - Job queue status
 * - Database replica health
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { healthCheck, HealthCheckResult } from '../../services/monitoring/healthCheck';
import { performanceMonitor } from '../../utils/performanceMonitoring';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { Typography } from '../../constants/typography';

const MonitoringDashboard: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthCheckResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = async () => {
    const data = await healthCheck.runHealthCheck();
    setHealthData(data);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHealthData();
    setRefreshing(false);
  };

  const handleLogReport = () => {
    performanceMonitor.logReport();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return Colors.success;
      case 'degraded': return Colors.warning;
      case 'unhealthy': return Colors.error;
      default: return Colors.text.secondary;
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unhealthy': return '❌';
      default: return '⚪';
    }
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (!healthData) {
    return (
      <View style={styles.container}>
        <Text>Loading health data...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Overall Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={[styles.statusCard, { borderLeftColor: getStatusColor(healthData.status) }]}>
          <Text style={styles.statusText}>
            {getStatusEmoji(healthData.status)} {healthData.status.toUpperCase()}
          </Text>
          <Text style={styles.metaText}>
            Uptime: {formatUptime(healthData.uptime)}
          </Text>
          <Text style={styles.metaText}>
            Last check: {new Date(healthData.timestamp).toLocaleTimeString()}
          </Text>
        </View>
      </View>

      {/* Alerts */}
      {healthData.alerts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠️ Alerts</Text>
          {healthData.alerts.map((alert, index) => (
            <View key={index} style={styles.alertCard}>
              <Text style={styles.alertText}>{alert}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Component Health */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Components</Text>
        {Object.entries(healthData.checks).map(([name, check]) => (
          <View key={name} style={styles.componentCard}>
            <View style={styles.componentHeader}>
              <Text style={styles.componentName}>
                {getStatusEmoji(check.status)} {name}
              </Text>
              {check.latency && (
                <Text style={styles.latencyText}>{check.latency.toFixed(0)}ms</Text>
              )}
            </View>
            <Text style={styles.componentMessage}>{check.message}</Text>
          </View>
        ))}
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Latency</Text>
          <Text style={styles.metricValue}>
            P95: {healthData.metrics.performance.p95.toFixed(0)}ms
          </Text>
          <Text style={styles.metricSubtext}>
            Avg: {healthData.metrics.performance.avg.toFixed(0)}ms |
            P99: {healthData.metrics.performance.p99.toFixed(0)}ms
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Cache</Text>
          <Text style={styles.metricValue}>
            {(healthData.metrics.cache.hitRate * 100).toFixed(1)}% hit rate
          </Text>
          <Text style={styles.metricSubtext}>
            Memory: {healthData.metrics.cache.memoryItems} items |
            Evictions: {healthData.metrics.cache.evictions}
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Job Queue</Text>
          <Text style={styles.metricValue}>
            {healthData.metrics.jobQueue.pending} pending
          </Text>
          <Text style={styles.metricSubtext}>
            Processing: {healthData.metrics.jobQueue.processing} |
            Avg time: {healthData.metrics.jobQueue.avgProcessingTime.toFixed(0)}ms
          </Text>
        </View>
      </View>

      {/* Database Replicas */}
      {Object.keys(healthData.metrics.replicas).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Read Replicas</Text>
          {Object.entries(healthData.metrics.replicas).map(([name, stats]) => (
            <View key={name} style={styles.replicaCard}>
              <Text style={styles.replicaName}>{name}</Text>
              <Text style={styles.replicaStats}>
                Queries: {stats.queries} | Errors: {stats.errors}
              </Text>
              <Text style={styles.replicaStats}>
                Avg latency: {stats.avgLatency.toFixed(0)}ms
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.button} onPress={handleLogReport}>
          <Text style={styles.buttonText}>Log Performance Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => performanceMonitor.reset()}
        >
          <Text style={styles.buttonText}>Reset Metrics</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Monitoring Dashboard v1.0 | Refresh to update
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.sm,
  },
  statusCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  statusText: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  metaText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginTop: Spacing.xs / 2,
  },
  alertCard: {
    backgroundColor: Colors.gray[100],
    padding: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.xs,
  },
  alertText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
  componentCard: {
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.xs,
  },
  componentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs / 2,
  },
  componentName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    textTransform: 'capitalize',
  },
  latencyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  componentMessage: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  metricCard: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  metricLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
    marginBottom: Spacing.xs / 2,
  },
  metricValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.bold),
    color: Colors.text.primary,
  },
  metricSubtext: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    marginTop: Spacing.xs / 2,
  },
  replicaCard: {
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.xs,
  },
  replicaName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.text.primary,
    marginBottom: Spacing.xs / 2,
  },
  replicaStats: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text.secondary,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: Colors.gray[500],
  },
  buttonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    fontFamily: Typography.getFontFamily(Typography.fontWeight.semibold),
    color: Colors.white,
  },
  footer: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
    padding: Spacing.lg,
  },
});

export default MonitoringDashboard;
