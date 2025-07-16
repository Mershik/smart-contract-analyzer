import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, AlertTriangle, CheckCircle, Users } from "lucide-react";
import type { RightsImbalance } from "@shared/schema";

interface RightsImbalanceResultsProps {
  rightsImbalance: RightsImbalance[];
}

export function RightsImbalanceResults({ rightsImbalance }: RightsImbalanceResultsProps) {
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
      case 'termination_rights': return '🔚';
      case 'suspension_rights': return '⏸️';
      case 'modification_rights': return '✏️';
      case 'refusal_rights': return '❌';
      case 'control_rights': return '🔍';
      default: return '⚖️';
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'termination_rights': return 'Права расторжения';
      case 'suspension_rights': return 'Права приостановки';
      case 'modification_rights': return 'Права изменения';
      case 'refusal_rights': return 'Права отказа';
      case 'control_rights': return 'Контрольные права';
      default: return 'Другие права';
    }
  };

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

        {/* Список дисбалансов */}
        <div className="space-y-3">
          {rightsImbalance.map((imbalance) => (
            <div
              key={imbalance.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{getTypeIcon(imbalance.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{getTypeName(imbalance.type)}</span>
                    <Badge className={getSeverityColor(imbalance.severity)}>
                      {imbalance.severity === 'high' && 'Высокий'}
                      {imbalance.severity === 'medium' && 'Средний'}
                      {imbalance.severity === 'low' && 'Низкий'}
                    </Badge>
                  </div>
                  
                  <p className="text-gray-700 mb-3">{imbalance.description}</p>
                  
                  {/* Сравнение прав */}
                  <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span>Покупатель: </span>
                      <Badge variant="outline" className="text-blue-600">
                        {imbalance.buyerRights}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-500" />
                      <span>Поставщик: </span>
                      <Badge variant="outline" className="text-green-600">
                        {imbalance.supplierRights}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Рекомендация */}
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <span className="font-medium">Рекомендация: </span>
                        {imbalance.recommendation}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
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