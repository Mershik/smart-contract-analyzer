import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scale, AlertTriangle, CheckCircle, Users, Gavel, Settings, Shield, Eye, FileText, FileIcon } from "lucide-react";
import { useState } from "react";
import type { RightsImbalance } from "@shared/schema";

interface RightsImbalanceResultsProps {
  rightsImbalance: RightsImbalance[];
}

export function RightsImbalanceResults({ rightsImbalance }: RightsImbalanceResultsProps) {
  const [expandedClauses, setExpandedClauses] = useState<Set<string>>(new Set());

  if (rightsImbalance.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-green-600" />
            Дисбаланс прав сторон
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span>Критичный дисбаланс прав между сторонами не обнаружен</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'termination': return <Gavel className="h-5 w-5" />;
      case 'modification': return <Settings className="h-5 w-5" />;
      case 'liability': return <Shield className="h-5 w-5" />;
      case 'control': return <Eye className="h-5 w-5" />;
      case 'procedural': return <FileText className="h-5 w-5" />;
      case 'weighted_analysis': return <Scale className="h-5 w-5" />;
      default: return <Scale className="h-5 w-5" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'termination': return 'Права расторжения договора';
      case 'modification': return 'Права изменения условий';
      case 'liability': return 'Права взыскания штрафов/неустоек';
      case 'control': return 'Права контроля и проверки';
      case 'procedural': return 'Процедурные права';
      case 'weighted_analysis': return 'Взвешенный анализ';
      case 'general_rights': return 'Общий анализ прав';
      default: return 'Другие права';
    }
  };

  const toggleClause = (clauseId: string) => {
    const newExpanded = new Set(expandedClauses);
    if (newExpanded.has(clauseId)) {
      newExpanded.delete(clauseId);
    } else {
      newExpanded.add(clauseId);
    }
    setExpandedClauses(newExpanded);
  };

  // Группируем дисбалансы по типам
  const groupedImbalances = rightsImbalance.reduce((groups, imbalance) => {
    const key = imbalance.type;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(imbalance);
    return groups;
  }, {} as Record<string, RightsImbalance[]>);

  const totalBuyerRights = rightsImbalance.reduce((sum, item) => sum + item.buyerRights, 0);
  const totalSupplierRights = rightsImbalance.reduce((sum, item) => sum + item.supplierRights, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-amber-600" />
          Дисбаланс прав сторон
          <Badge variant="outline" className="ml-auto">
            {rightsImbalance.length} дисбаланс{rightsImbalance.length > 1 ? 'ов' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Общая статистика */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalBuyerRights}</div>
            <div className="text-sm text-gray-600">Права Покупателя</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totalSupplierRights}</div>
            <div className="text-sm text-gray-600">Права Поставщика</div>
          </div>
        </div>

        {/* Группированные дисбалансы */}
        <div className="space-y-3">
          {Object.entries(groupedImbalances).map(([type, imbalances]) => {
            const mainImbalance = imbalances[0];
            const hasDetails = mainImbalance.buyerRightsClauses || mainImbalance.supplierRightsClauses;
            const buyerClauses = (mainImbalance.buyerRightsClauses || []).filter(clause => clause && clause.text);
            const supplierClauses = (mainImbalance.supplierRightsClauses || []).filter(clause => clause && clause.text);
            const bothColumns = buyerClauses.length > 0 && supplierClauses.length > 0;
            return (
              <div
                key={type}
                className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Заголовок группы */}
                <div className="p-4 bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-amber-600">{getTypeIcon(type)}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-lg">{getTypeName(type)}</span>
                          <Badge className={getSeverityColor(mainImbalance.severity)}>
                            {mainImbalance.severity === 'high' && 'КРИТИЧНО'}
                            {mainImbalance.severity === 'medium' && 'Средний'}
                            {mainImbalance.severity === 'low' && 'Низкий'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Основная информация */}
                <div className="p-4">
                  {/* Сравнение прав */}
                  <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span>Покупатель: </span>
                      <Badge variant="outline" className="text-blue-600">
                        {mainImbalance.buyerRights}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      <span>Поставщик: </span>
                      <Badge variant="outline" className="text-green-600">
                        {mainImbalance.supplierRights}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Рекомендация */}
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <span className="font-medium">Рекомендация: </span>
                        {mainImbalance.recommendation}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Детализированная информация */}
                {hasDetails && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="grid md:grid-cols-2 grid-cols-1 gap-4">
                      {/* Левая колонка: Покупатель */}
                      {buyerClauses.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="font-medium text-blue-700 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Права Покупателя ({buyerClauses.length})
                          </h4>
                          <div className="space-y-1">
                            {buyerClauses.map((clause) => (
                              <div
                                key={clause.id}
                                className={
                                  `text-sm bg-blue-50 p-2 rounded border-l-2 border-blue-300 transition-colors` +
                                  (clause.text.length > 100 ? ' cursor-pointer hover:bg-blue-100' : '')
                                }
                                onClick={() => clause.text.length > 100 && toggleClause(`buyer-${clause.id}`)}
                              >
                                <div className="flex items-start gap-2">
                                  {/* <Button ...> <FileIcon /> </Button> убрано */}
                                  <div className="flex-1">
                                    <span className="text-blue-700 select-text">
                                      {expandedClauses.has(`buyer-${clause.id}`) && clause.text.length > 100
                                        ? clause.text
                                        : (clause.text.length > 100 ? `${clause.text.substring(0, 100)}...` : clause.text)
                                      }
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-[48px] bg-blue-50 rounded border-l-2 border-blue-100 opacity-60" />
                      )}
                      {/* Правая колонка: Поставщик */}
                      {supplierClauses.length > 0 ? (
                        <div className="space-y-2">
                          <h4 className="font-medium text-green-700 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Права Поставщика ({supplierClauses.length})
                          </h4>
                          <div className="space-y-1">
                            {supplierClauses.map((clause) => (
                              <div
                                key={clause.id}
                                className={
                                  `text-sm bg-green-50 p-2 rounded border-l-2 border-green-300 transition-colors` +
                                  (clause.text.length > 100 ? ' cursor-pointer hover:bg-green-100' : '')
                                }
                                onClick={() => clause.text.length > 100 && toggleClause(`supplier-${clause.id}`)}
                              >
                                <div className="flex items-start gap-2">
                                  {/* <Button ...> <FileIcon /> </Button> убрано */}
                                  <div className="flex-1">
                                    <span className="text-green-700 select-text">
                                      {expandedClauses.has(`supplier-${clause.id}`) && clause.text.length > 100
                                        ? clause.text
                                        : (clause.text.length > 100 ? `${clause.text.substring(0, 100)}...` : clause.text)
                                      }
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-[48px] bg-green-50 rounded border-l-2 border-green-100 opacity-60" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Общая рекомендация */}
        {rightsImbalance.length > 0 && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Scale className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Общая рекомендация: </span>
                Рассмотрите возможность более равномерного распределения прав между сторонами. 
                Значительный дисбаланс может создавать правовые риски и повышать вероятность споров.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}