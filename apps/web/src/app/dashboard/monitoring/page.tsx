'use client';

import React, { useState } from 'react';
import { useProtocolMetrics, useUserMetrics, useFeeMetrics, useMetricsSummary } from '@/lib/hooks/use-metrics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatCompactNumber } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUpIcon, 
  UsersIcon, 
  DollarSignIcon, 
  ActivityIcon
} from 'lucide-react';

/**
 * Monitoring Dashboard Page
 * Displays protocol-wide metrics, user metrics, and fee analytics
 */
export default function MonitoringPage() {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const [userFilters, setUserFilters] = useState({
    sortBy: 'volume' as 'volume' | 'payments' | 'fees' | 'lastPayment',
    sortOrder: 'desc' as 'asc' | 'desc',
    page: 1,
    limit: 20,
  });
  const [feeFilters, setFeeFilters] = useState({
    chain: '',
    page: 1,
    limit: 20,
  });

  // Fetch metrics
  const { data: protocolMetrics, isLoading: protocolLoading } = useProtocolMetrics({
    refetchInterval: 30000,
  });

  const { data: userMetricsData, isLoading: usersLoading } = useUserMetrics(
    {
      sortBy: userFilters.sortBy,
      sortOrder: userFilters.sortOrder,
      page: userFilters.page,
      limit: userFilters.limit,
    },
    { refetchInterval: 60000 }
  );

  const { data: feeMetricsData, isLoading: feesLoading } = useFeeMetrics(
    {
      chain: feeFilters.chain || undefined,
      fromDate: dateRange.from,
      toDate: dateRange.to,
      page: feeFilters.page,
      limit: feeFilters.limit,
    },
    { refetchInterval: 60000 }
  );

  const { data: summary, isLoading: summaryLoading } = useMetricsSummary(
    {
      fromDate: dateRange.from,
      toDate: dateRange.to,
      topUsers: 10,
      recentFees: 10,
    },
    { refetchInterval: 30000 }
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Monitoring Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time metrics and analytics for the payment router protocol
        </p>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Date Range Filter</CardTitle>
          <CardDescription>Filter metrics by date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="fromDate">From Date</Label>
              <Input
                id="fromDate"
                type="date"
                value={dateRange.from || ''}
                onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="toDate">To Date</Label>
              <Input
                id="toDate"
                type="date"
                value={dateRange.to || ''}
                onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setDateRange({})}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Protocol Metrics Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {protocolLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCompactNumber(protocolMetrics?.totalUsers || 0)}
                </div>
                <p className="text-xs text-muted-foreground">Active agents</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <ActivityIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {protocolLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCompactNumber(protocolMetrics?.totalPayments || 0)}
                </div>
                <p className="text-xs text-muted-foreground">All-time payments</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {protocolLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(protocolMetrics?.totalVolumeUSD || 0)}
                </div>
                <p className="text-xs text-muted-foreground">USD processed</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
            <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {protocolLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(protocolMetrics?.totalFeesCollected || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg: {formatCurrency(protocolMetrics?.averageFeePerPayment || 0)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Tabs */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="users">Top Users</TabsTrigger>
          <TabsTrigger value="fees">Fee Analytics</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Users */}
            <Card>
              <CardHeader>
                <CardTitle>Top Users by Volume</CardTitle>
                <CardDescription>Users with highest payment volume</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {summary?.topUsers?.map((user, index) => (
                      <div
                        key={user.address}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <span className="text-sm font-semibold">#{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {user.address.slice(0, 8)}...{user.address.slice(-6)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {user.payments} payments
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(user.volume)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(user.fees)} fees
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!summary?.topUsers || summary.topUsers.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">
                        No user data available
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Fees */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Fees</CardTitle>
                <CardDescription>Latest fee transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {summary?.recentFees?.map((fee) => (
                      <div
                        key={fee.intentId}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium text-sm">
                            {fee.intentId.slice(0, 12)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline">{fee.chain}</Badge>
                            <p className="text-xs text-muted-foreground">
                              {new Date(fee.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(fee.fee)}</p>
                          <p className="text-xs text-muted-foreground">
                            {fee.agent.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    ))}
                    {(!summary?.recentFees || summary.recentFees.length === 0) && (
                      <p className="text-center text-muted-foreground py-8">
                        No fee data available
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Metrics</CardTitle>
              <CardDescription>Detailed user payment statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                <div>
                  <Label>Sort By</Label>
                  <Select
                    value={userFilters.sortBy}
                    onValueChange={(value: 'volume' | 'payments' | 'fees' | 'lastPayment') =>
                      setUserFilters({ ...userFilters, sortBy: value, page: 1 })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="volume">Volume</SelectItem>
                      <SelectItem value="payments">Payments</SelectItem>
                      <SelectItem value="fees">Fees</SelectItem>
                      <SelectItem value="lastPayment">Last Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Order</Label>
                  <Select
                    value={userFilters.sortOrder}
                    onValueChange={(value: 'asc' | 'desc') =>
                      setUserFilters({ ...userFilters, sortOrder: value, page: 1 })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Descending</SelectItem>
                      <SelectItem value="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* User List */}
              {usersLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {userMetricsData?.users?.map((user) => (
                    <div
                      key={user.agentAddress}
                      className="p-4 rounded-lg border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{user.agentAddress}</p>
                          <p className="text-sm text-muted-foreground">
                            First payment: {new Date(user.firstPaymentAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {user.totalPayments} payments
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Volume</p>
                          <p className="font-semibold">{formatCurrency(user.totalVolumeUSD)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Fees</p>
                          <p className="font-semibold">{formatCurrency(user.totalFeesGenerated)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Last Payment</p>
                          <p className="font-semibold text-sm">
                            {new Date(user.lastPaymentAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!userMetricsData?.users || userMetricsData.users.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      No user data available
                    </p>
                  )}
                </div>
              )}

              {/* Pagination */}
              {userMetricsData && userMetricsData.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {userMetricsData.page} of {userMetricsData.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={userFilters.page === 1}
                      onClick={() => setUserFilters({ ...userFilters, page: userFilters.page - 1 })}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={userFilters.page >= userMetricsData.totalPages}
                      onClick={() => setUserFilters({ ...userFilters, page: userFilters.page + 1 })}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fee Analytics</CardTitle>
              <CardDescription>Detailed fee transaction data</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <div>
                  <Label>Chain</Label>
                  <Select
                    value={feeFilters.chain}
                    onValueChange={(value) =>
                      setFeeFilters({ ...feeFilters, chain: value, page: 1 })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All chains" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All chains</SelectItem>
                      <SelectItem value="ethereum">Ethereum</SelectItem>
                      <SelectItem value="arbitrum">Arbitrum</SelectItem>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="polygon">Polygon</SelectItem>
                      <SelectItem value="optimism">Optimism</SelectItem>
                      <SelectItem value="stacks">Stacks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fee List */}
              {feesLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {feeMetricsData?.fees?.map((fee) => (
                    <div
                      key={fee.intentId}
                      className="p-4 rounded-lg border space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{fee.intentId}</p>
                          <p className="text-sm text-muted-foreground">
                            {fee.agentAddress}
                          </p>
                        </div>
                        <Badge variant="outline">{fee.sourceChain}</Badge>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Settlement Fee</p>
                          <p className="font-semibold">{formatCurrency(fee.settlementFee)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Fees</p>
                          <p className="font-semibold">{formatCurrency(fee.totalFeesUSD)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Fee BPS</p>
                          <p className="font-semibold">{fee.settlementFeeBps}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Timestamp</p>
                          <p className="font-semibold text-sm">
                            {new Date(fee.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!feeMetricsData?.fees || feeMetricsData.fees.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      No fee data available
                    </p>
                  )}
                </div>
              )}

              {/* Pagination */}
              {feeMetricsData && feeMetricsData.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    Page {feeMetricsData.page} of {feeMetricsData.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={feeFilters.page === 1}
                      onClick={() => setFeeFilters({ ...feeFilters, page: feeFilters.page - 1 })}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={feeFilters.page >= feeMetricsData.totalPages}
                      onClick={() => setFeeFilters({ ...feeFilters, page: feeFilters.page + 1 })}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

