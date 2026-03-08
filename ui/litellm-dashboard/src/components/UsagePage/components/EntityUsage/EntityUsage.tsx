import useTeams from "@/app/(dashboard)/hooks/useTeams";
import { formatNumberWithCommas } from "@/utils/dataUtils";
import {
  BarChart,
  Card,
  Col,
  DateRangePickerValue,
  DonutChart,
  Grid,
  Subtitle,
  Tab,
  TabGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TabList,
  TabPanel,
  TabPanels,
  Text,
  Title,
} from "@tremor/react";
import React, { useEffect, useState } from "react";
import { ActivityMetrics, processActivityData } from "../../../activity_metrics";
import { UsageExportHeader } from "../../../EntityUsageExport";
import type { EntityType } from "../../../EntityUsageExport/types";
import {
  agentDailyActivityCall,
  customerDailyActivityCall,
  organizationDailyActivityCall,
  tagDailyActivityCall,
  teamDailyActivityCall,
  userDailyActivityCall,
} from "../../../networking";
import { getProviderLogoAndName } from "../../../provider_info_helpers";
import { BreakdownMetrics, DailyData, EntityMetricWithMetadata, KeyMetricWithMetadata, TagUsage } from "../../types";
import { valueFormatterSpend } from "../../utils/value_formatters";
import EndpointUsage from "../EndpointUsage/EndpointUsage";
import TopKeyView from "./TopKeyView";
import TopModelView from "./TopModelView";

interface EntityMetrics {
  metrics: {
    spend: number;
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    total_tokens: number;
    successful_requests: number;
    failed_requests: number;
    api_requests: number;
  };
  metadata: Record<string, any>;
}

interface ExtendedDailyData extends DailyData {
  breakdown: BreakdownMetrics;
}

interface EntitySpendData {
  results: ExtendedDailyData[];
  metadata: {
    total_spend: number;
    total_api_requests: number;
    total_successful_requests: number;
    total_failed_requests: number;
    total_tokens: number;
  };
}

export interface EntityList {
  label: string;
  value: string;
}

interface EntityUsageProps {
  accessToken: string | null;
  entityType: EntityType;
  entityId?: string | null;
  userID: string | null;
  userRole: string | null;
  entityList: EntityList[] | null;
  premiumUser: boolean;
  dateValue: DateRangePickerValue;
  showCost?: boolean;
}

const EntityUsage: React.FC<EntityUsageProps> = ({
  accessToken,
  entityType,
  entityId,
  entityList,
  dateValue,
  showCost = true,
}) => {
  const [spendData, setSpendData] = useState<EntitySpendData>({
    results: [],
    metadata: {
      total_spend: 0,
      total_api_requests: 0,
      total_successful_requests: 0,
      total_failed_requests: 0,
      total_tokens: 0,
    },
  });
  const { teams } = useTeams();

  const modelMetrics = processActivityData(spendData, "models", teams || []);
  const keyMetrics = processActivityData(spendData, "api_keys", teams || []);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [topKeysLimit, setTopKeysLimit] = useState<number>(5);
  const [topModelsLimit, setTopModelsLimit] = useState<number>(5);
  const metricLabel = showCost ? "Spend" : "Tokens";
  const metricKey = showCost ? "metrics.spend" : "metrics.total_tokens";
  const metricValueFormatter = (value: number) =>
    showCost ? valueFormatterSpend(value) : formatNumberWithCommas(value, 0);

  const fetchSpendData = async () => {
    if (!accessToken || !dateValue.from || !dateValue.to) return;
    // Create new Date objects to avoid mutating the original dates
    const startTime = new Date(dateValue.from);
    const endTime = new Date(dateValue.to);

    if (entityType === "tag") {
      const data = await tagDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags : null,
      );
      setSpendData(data);
    } else if (entityType === "team") {
      const data = await teamDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags : null,
      );
      setSpendData(data);
    } else if (entityType === "organization") {
      const data = await organizationDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags : null,
      );
      setSpendData(data);
    } else if (entityType === "customer") {
      const data = await customerDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags : null,
      );
      setSpendData(data);
    } else if (entityType === "agent") {
      const data = await agentDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags : null,
      );
      setSpendData(data);
    } else if (entityType === "user") {
      const data = await userDailyActivityCall(
        accessToken,
        startTime,
        endTime,
        1,
        selectedTags.length > 0 ? selectedTags[0] : null,
      );
      setSpendData(data);
    } else {
      throw new Error("Invalid entity type");
    }
  };

  useEffect(() => {
    fetchSpendData();
  }, [accessToken, dateValue, entityId, selectedTags]);

  const getTopModels = () => {
    const modelSpend: { [key: string]: any } = {};
    spendData.results.forEach((day) => {
      Object.entries(day.breakdown.models || {}).forEach(([model, metrics]) => {
        if (!modelSpend[model]) {
          modelSpend[model] = {
            spend: 0,
            requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            tokens: 0,
          };
        }
        try {
          modelSpend[model].spend += metrics.metrics.spend;
        } catch (e) {
          console.error(`Error adding spend for ${model}: ${e}, got metrics: ${JSON.stringify(metrics)}`);
        }
        modelSpend[model].requests += metrics.metrics.api_requests;
        modelSpend[model].successful_requests += metrics.metrics.successful_requests;
        modelSpend[model].failed_requests += metrics.metrics.failed_requests;
        modelSpend[model].tokens += metrics.metrics.total_tokens;
      });
    });

    return Object.entries(modelSpend)
      .map(([model, metrics]) => ({
        key: model,
        ...metrics,
      }))
      .sort((a, b) => (showCost ? b.spend - a.spend : b.tokens - a.tokens))
      .slice(0, topModelsLimit);
  };

  const getTopAPIKeys = () => {
    console.log("debugTags", { spendData });
    const keySpend: { [key: string]: KeyMetricWithMetadata } = {};
    spendData.results.forEach((day) => {
      const { breakdown } = day;
      const { entities } = breakdown;
      console.log("debugTags", { entities });
      const tagDictionary = Object.keys(entities).reduce((acc: { [key: string]: TagUsage[] }, entity) => {
        const { api_key_breakdown } = entities[entity];
        Object.keys(api_key_breakdown).forEach((key) => {
          const tagUsage = { tag: entity, usage: api_key_breakdown[key].metrics.spend };
          if (acc[key]) {
            acc[key].push(tagUsage);
          } else {
            acc[key] = [tagUsage];
          }
        });
        return acc;
      }, {});
      console.log("debugTags", { tagDictionary });
      Object.entries(day.breakdown.api_keys || {}).forEach(([key, metrics]) => {
        if (!keySpend[key]) {
          keySpend[key] = {
            metrics: {
              spend: 0,
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              api_requests: 0,
              successful_requests: 0,
              failed_requests: 0,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            metadata: {
              key_alias: metrics.metadata.key_alias,
              team_id: metrics.metadata.team_id || null,
              tags: tagDictionary[key] || [],
            },
          };
          console.log("debugTags", { keySpend });
        }
        keySpend[key].metrics.spend += metrics.metrics.spend;
        keySpend[key].metrics.prompt_tokens += metrics.metrics.prompt_tokens;
        keySpend[key].metrics.completion_tokens += metrics.metrics.completion_tokens;
        keySpend[key].metrics.total_tokens += metrics.metrics.total_tokens;
        keySpend[key].metrics.api_requests += metrics.metrics.api_requests;
        keySpend[key].metrics.successful_requests += metrics.metrics.successful_requests;
        keySpend[key].metrics.failed_requests += metrics.metrics.failed_requests;
        keySpend[key].metrics.cache_read_input_tokens += metrics.metrics.cache_read_input_tokens || 0;
        keySpend[key].metrics.cache_creation_input_tokens += metrics.metrics.cache_creation_input_tokens || 0;
      });
    });

    return Object.entries(keySpend)
      .map(([api_key, metrics]) => ({
        api_key,
        key_alias: metrics.metadata.key_alias || "-", // Using truncated key as alias
        tags: metrics.metadata.tags || "-",
        spend: metrics.metrics.spend,
        tokens: metrics.metrics.total_tokens,
      }))
      .sort((a, b) => (showCost ? b.spend - a.spend : b.tokens - a.tokens))
      .slice(0, topKeysLimit);
  };

  const getProviderSpend = () => {
    const providerSpend: { [key: string]: any } = {};
    spendData.results.forEach((day) => {
      Object.entries(day.breakdown.providers || {}).forEach(([provider, metrics]) => {
        if (!providerSpend[provider]) {
          providerSpend[provider] = {
            provider,
            spend: 0,
            requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            tokens: 0,
          };
        }
        try {
          providerSpend[provider].spend += metrics.metrics.spend;
          providerSpend[provider].requests += metrics.metrics.api_requests;
          providerSpend[provider].successful_requests += metrics.metrics.successful_requests;
          providerSpend[provider].failed_requests += metrics.metrics.failed_requests;
          providerSpend[provider].tokens += metrics.metrics.total_tokens;
        } catch (e) {
          console.error(`Error processing provider ${provider}: ${e}`);
        }
      });
    });

    return Object.values(providerSpend)
      .filter((provider) => (showCost ? provider.spend > 0 : provider.tokens > 0))
      .sort((a, b) => (showCost ? b.spend - a.spend : b.tokens - a.tokens));
  };

  const getAllTags = () => {
    if (entityList) {
      return entityList;
    }
  };

  const getEntityLabel = (entity: string, metadata?: Record<string, any>): string => {
    if (entityList) {
      const entityItem = entityList.find((item) => item.value === entity);
      if (entityItem) {
        return entityItem.label;
      }
    }
    // Fallback to team_alias for backward compatibility
    if (metadata?.team_alias) {
      return metadata.team_alias;
    }
    return entity;
  };

  const filterDataByTags = (data: EntityMetricWithMetadata[]) => {
    if (selectedTags.length === 0) return data;
    return data.filter((item) => selectedTags.includes(item.metadata.id));
  };

  const getEntityBreakdown = () => {
    const entitySpend: { [key: string]: EntityMetricWithMetadata } = {};
    spendData.results.forEach((day) => {
      Object.entries(day.breakdown.entities || {}).forEach(([entity, data]) => {
        if (!entitySpend[entity]) {
          entitySpend[entity] = {
            metrics: {
              spend: 0,
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              api_requests: 0,
              successful_requests: 0,
              failed_requests: 0,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            metadata: {
              alias: getEntityLabel(entity, data.metadata as any),
              id: entity,
            },
          };
        }
        entitySpend[entity].metrics.spend += data.metrics.spend;
        entitySpend[entity].metrics.api_requests += data.metrics.api_requests;
        entitySpend[entity].metrics.successful_requests += data.metrics.successful_requests;
        entitySpend[entity].metrics.failed_requests += data.metrics.failed_requests;
        entitySpend[entity].metrics.total_tokens += data.metrics.total_tokens;
      });
    });

    const result = Object.values(entitySpend).sort((a, b) =>
      showCost ? b.metrics.spend - a.metrics.spend : b.metrics.total_tokens - a.metrics.total_tokens,
    );

    return filterDataByTags(result);
  };

  const getProcessedEntityBreakdownForChart = () => {
    const data = getEntityBreakdown();
    const topEntities = data.slice(0, 5);
    return topEntities.map((e) => ({
      ...e,
      metadata: {
        ...e.metadata,
        alias_display:
          e.metadata.alias && e.metadata.alias.length > 15 ? `${e.metadata.alias.slice(0, 15)}...` : e.metadata.alias,
      },
    }));
  };

  const getFilterLabel = (entityType: string) => {
    return `Filter by ${entityType}`;
  };

  const getFilterPlaceholder = (entityType: string) => {
    return `Select ${entityType} to filter...`;
  };

  const capitalizedEntityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return (
    <div style={{ width: "100%" }} className="relative">
      <UsageExportHeader
        dateValue={dateValue}
        entityType={entityType}
        spendData={spendData}
        showFilters={entityList !== null && entityList.length > 0}
        filterLabel={getFilterLabel(entityType)}
        filterPlaceholder={getFilterPlaceholder(entityType)}
        selectedFilters={selectedTags}
        onFiltersChange={setSelectedTags}
        filterOptions={getAllTags() || undefined}
        filterMode={entityType === "user" ? "single" : "multiple"}
        teams={teams || []}
      />
      <TabGroup>
        <TabList variant="solid" className="mt-1">
          <Tab>{showCost ? "Cost" : "Usage"}</Tab>
          <Tab>{entityType === "agent" ? "Request / Token Consumption" : "Model Activity"}</Tab>
          <Tab>Key Activity</Tab>
          <Tab>Endpoint Activity</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <Grid numItems={2} className="gap-2 w-full">
              {/* Total Spend Card */}
              <Col numColSpan={2}>
                <Card>
                  <Title>{capitalizedEntityLabel} {metricLabel} Overview</Title>
                  <Grid numItems={showCost ? 5 : 4} className="gap-4 mt-4">
                    {showCost && (
                      <Card>
                        <Title>Total Spend</Title>
                        <Text className="text-2xl font-bold mt-2">
                          ${formatNumberWithCommas(spendData.metadata.total_spend, 2)}
                        </Text>
                      </Card>
                    )}
                    <Card>
                      <Title>Total Requests</Title>
                      <Text className="text-2xl font-bold mt-2">
                        {spendData.metadata.total_api_requests.toLocaleString()}
                      </Text>
                    </Card>
                    <Card>
                      <Title>Successful Requests</Title>
                      <Text className="text-2xl font-bold mt-2 text-green-600">
                        {spendData.metadata.total_successful_requests.toLocaleString()}
                      </Text>
                    </Card>
                    <Card>
                      <Title>Failed Requests</Title>
                      <Text className="text-2xl font-bold mt-2 text-red-600">
                        {spendData.metadata.total_failed_requests.toLocaleString()}
                      </Text>
                    </Card>
                    <Card>
                      <Title>Total Tokens</Title>
                      <Text className="text-2xl font-bold mt-2">
                        {spendData.metadata.total_tokens.toLocaleString()}
                      </Text>
                    </Card>
                  </Grid>
                </Card>
              </Col>

              {/* Daily Spend Chart */}
              <Col numColSpan={2}>
                <Card>
                  <Title>Daily {metricLabel}</Title>
                  <BarChart
                    data={[...spendData.results].sort(
                      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
                    )}
                    index="date"
                    categories={[metricKey]}
                    colors={["cyan"]}
                    valueFormatter={metricValueFormatter}
                    yAxisWidth={100}
                    showLegend={false}
                    customTooltip={({ payload, active }) => {
                      if (!active || !payload?.[0]) return null;
                      const data = payload[0].payload;
                      const entityCount = Object.keys(data.breakdown.entities || {}).length;
                      const metricValue = showCost ? data.metrics.spend : data.metrics.total_tokens;
                      return (
                        <div className="bg-white p-4 shadow-lg rounded-lg border">
                          <p className="font-bold">{data.date}</p>
                          <p className="text-cyan-500">
                            Total {metricLabel}:{" "}
                            {showCost ? `$${formatNumberWithCommas(metricValue, 2)}` : formatNumberWithCommas(metricValue, 0)}
                          </p>
                          <p className="text-gray-600">Total Requests: {data.metrics.api_requests}</p>
                          <p className="text-gray-600">Successful: {data.metrics.successful_requests}</p>
                          <p className="text-gray-600">Failed: {data.metrics.failed_requests}</p>
                          <p className="text-gray-600">Total Tokens: {data.metrics.total_tokens}</p>
                          <p className="text-gray-600">
                            Total {capitalizedEntityLabel}s: {entityCount}
                          </p>
                          <div className="mt-2 border-t pt-2">
                            <p className="font-semibold">{metricLabel} by {capitalizedEntityLabel}:</p>
                            {Object.entries(data.breakdown.entities || {})
                              .sort(([, a], [, b]) => {
                                const metricA = showCost
                                  ? (a as EntityMetrics).metrics.spend
                                  : (a as EntityMetrics).metrics.total_tokens;
                                const metricB = showCost
                                  ? (b as EntityMetrics).metrics.spend
                                  : (b as EntityMetrics).metrics.total_tokens;
                                return metricB - metricA;
                              })
                              .slice(0, 5)
                              .map(([entity, entityData]) => {
                                const metrics = entityData as EntityMetrics;
                                const metricAmount = showCost ? metrics.metrics.spend : metrics.metrics.total_tokens;
                                return (
                                  <p key={entity} className="text-sm text-gray-600">
                                    {getEntityLabel(entity, metrics.metadata)}:{" "}
                                    {showCost
                                      ? `$${formatNumberWithCommas(metricAmount, 2)}`
                                      : formatNumberWithCommas(metricAmount, 0)}
                                  </p>
                                );
                              })}
                            {entityCount > 5 && (
                              <p className="text-sm text-gray-500 italic">...and {entityCount - 5} more</p>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                </Card>
              </Col>

              {/* Entity Breakdown Section */}
              <Col numColSpan={2}>
                <Card>
                  <div className="flex flex-col space-y-4">
                    <div className="flex flex-col space-y-2">
                      <Title>{metricLabel} Per {capitalizedEntityLabel}</Title>
                      <Subtitle className="text-xs">Showing Top 5 by {metricLabel}</Subtitle>
                      {showCost && (
                        <div className="flex items-center text-sm text-gray-500">
                          <span>Get Started by Tracking cost per {capitalizedEntityLabel} </span>
                          <a
                            href="https://docs.litellm.ai/docs/proxy/enterprise#spend-tracking"
                            className="text-blue-500 hover:text-blue-700 ml-1"
                          >
                            here
                          </a>
                        </div>
                      )}
                    </div>
                    <Grid numItems={2} className="gap-6">
                      <Col numColSpan={1}>
                        <BarChart
                          className="mt-4 h-52"
                          data={getProcessedEntityBreakdownForChart()}
                          index="metadata.alias_display"
                          categories={[metricKey]}
                          colors={["cyan"]}
                          valueFormatter={metricValueFormatter}
                          layout="vertical"
                          showLegend={false}
                          yAxisWidth={150}
                          customTooltip={({ payload, active }) => {
                            if (!active || !payload?.[0]) return null;
                            const data = payload[0].payload;
                            const metricValue = showCost ? data.metrics.spend : data.metrics.total_tokens;
                            return (
                              <div className="bg-white p-4 shadow-lg rounded-lg border">
                                <p className="font-bold">{data.metadata.alias}</p>
                                <p className="text-cyan-500">
                                  {metricLabel}:{" "}
                                  {showCost
                                    ? `$${formatNumberWithCommas(metricValue, 4)}`
                                    : formatNumberWithCommas(metricValue, 0)}
                                </p>
                                <p className="text-gray-600">Requests: {data.metrics.api_requests.toLocaleString()}</p>
                                <p className="text-green-600">
                                  Successful: {data.metrics.successful_requests.toLocaleString()}
                                </p>
                                <p className="text-red-600">Failed: {data.metrics.failed_requests.toLocaleString()}</p>
                                <p className="text-gray-600">Tokens: {data.metrics.total_tokens.toLocaleString()}</p>
                              </div>
                            );
                          }}
                        />
                      </Col>
                      <Col numColSpan={1}>
                        <div className="h-52 overflow-y-auto">
                          <Table>
                            <TableHead>
                            <TableRow>
                              <TableHeaderCell>{capitalizedEntityLabel}</TableHeaderCell>
                              <TableHeaderCell>{metricLabel}</TableHeaderCell>
                              <TableHeaderCell className="text-green-600">Successful</TableHeaderCell>
                              <TableHeaderCell className="text-red-600">Failed</TableHeaderCell>
                              <TableHeaderCell>Tokens</TableHeaderCell>
                            </TableRow>
                            </TableHead>
                            <TableBody>
                              {getEntityBreakdown()
                                .filter((entity) =>
                                  showCost ? entity.metrics.spend > 0 : entity.metrics.total_tokens > 0,
                                )
                                .map((entity) => (
                                  <TableRow key={entity.metadata.id}>
                                    <TableCell>{entity.metadata.alias}</TableCell>
                                    <TableCell>
                                      {showCost
                                        ? `$${formatNumberWithCommas(entity.metrics.spend, 4)}`
                                        : formatNumberWithCommas(entity.metrics.total_tokens, 0)}
                                    </TableCell>
                                    <TableCell className="text-green-600">
                                      {entity.metrics.successful_requests.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-red-600">
                                      {entity.metrics.failed_requests.toLocaleString()}
                                    </TableCell>
                                    <TableCell>{entity.metrics.total_tokens.toLocaleString()}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </Col>
                    </Grid>
                  </div>
                </Card>
              </Col>

              {/* Top API Keys */}
              <Col numColSpan={1}>
                <Card>
                  <Title>Top Virtual Keys</Title>
                  <TopKeyView
                    topKeys={getTopAPIKeys()}
                    teams={null}
                    showTags={entityType === "tag"}
                    topKeysLimit={topKeysLimit}
                    setTopKeysLimit={setTopKeysLimit}
                    metric={showCost ? "spend" : "tokens"}
                  />
                </Card>
              </Col>

              {/* Top Models */}
              <Col numColSpan={1}>
                <Card>
                  <Title>{entityType === "agent" ? "Top Agents" : "Top Models"}</Title>
                  <TopModelView
                    topModels={getTopModels()}
                    topModelsLimit={topModelsLimit}
                    setTopModelsLimit={setTopModelsLimit}
                    metric={showCost ? "spend" : "tokens"}
                  />
                </Card>
              </Col>

              {/* Spend by Provider */}
              <Col numColSpan={2}>
                <Card>
                  <div className="flex flex-col space-y-4">
                    <Title>Provider Usage</Title>
                    <Grid numItems={2}>
                      <Col numColSpan={1}>
                        <DonutChart
                          className="mt-4 h-40"
                          data={getProviderSpend()}
                          index="provider"
                          category={showCost ? "spend" : "tokens"}
                          valueFormatter={(value) =>
                            showCost ? `$${formatNumberWithCommas(value, 2)}` : formatNumberWithCommas(value, 0)
                          }
                          colors={["cyan", "blue", "indigo", "violet", "purple"]}
                        />
                      </Col>
                      <Col numColSpan={1}>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableHeaderCell>Provider</TableHeaderCell>
                              <TableHeaderCell>{metricLabel}</TableHeaderCell>
                              <TableHeaderCell className="text-green-600">Successful</TableHeaderCell>
                              <TableHeaderCell className="text-red-600">Failed</TableHeaderCell>
                              <TableHeaderCell>Tokens</TableHeaderCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {getProviderSpend().map((provider) => (
                              <TableRow key={provider.provider}>
                                <TableCell>
                                  <div className="flex items-center space-x-2">
                                    {provider.provider && (
                                      <img
                                        src={getProviderLogoAndName(provider.provider).logo}
                                        alt={`${provider.provider} logo`}
                                        className="w-4 h-4"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          const parent = target.parentElement;
                                          if (parent) {
                                            const fallbackDiv = document.createElement("div");
                                            fallbackDiv.className =
                                              "w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-xs";
                                            fallbackDiv.textContent = provider.provider?.charAt(0) || "-";
                                            parent.replaceChild(fallbackDiv, target);
                                          }
                                        }}
                                      />
                                    )}
                                    <span>{provider.provider}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {showCost
                                    ? `$${formatNumberWithCommas(provider.spend, 2)}`
                                    : formatNumberWithCommas(provider.tokens, 0)}
                                </TableCell>
                                <TableCell className="text-green-600">
                                  {provider.successful_requests.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-red-600">
                                  {provider.failed_requests.toLocaleString()}
                                </TableCell>
                                <TableCell>{provider.tokens.toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Col>
                    </Grid>
                  </div>
                </Card>
              </Col>
            </Grid>
          </TabPanel>
          <TabPanel>
            <ActivityMetrics
              modelMetrics={modelMetrics}
              hidePromptCachingMetrics={entityType === "agent"}
              showCost={showCost}
            />
          </TabPanel>
          <TabPanel>
            <ActivityMetrics
              modelMetrics={keyMetrics}
              hidePromptCachingMetrics={entityType === "agent"}
              showCost={showCost}
            />
          </TabPanel>
          <TabPanel>
            <EndpointUsage userSpendData={spendData} />
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
};

export default EntityUsage;
