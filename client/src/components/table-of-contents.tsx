import { useState, useEffect } from "react";
import { List, FileText, AlertTriangle, Target, Scale, Search } from "lucide-react";

interface TocItem {
  id: string;
  title: string;
  icon: React.ElementType;
}

interface TableOfContentsProps {
  hasStructuralAnalysis: boolean;
  hasResults: boolean;
  hasContradictions: boolean;
  hasRightsImbalance: boolean;
  hasMissingRequirements: boolean; // добавлено
}

export function TableOfContents({
  hasStructuralAnalysis,
  hasResults,
  hasContradictions,
  hasRightsImbalance,
  hasMissingRequirements, // добавлено
}: TableOfContentsProps) {
  const [activeSection, setActiveSection] = useState<string>("");

  // Список разделов для оглавления
  const tocItems: TocItem[] = [
    ...(hasStructuralAnalysis ? [{ 
      id: "structural-analysis", 
      title: "Структурный анализ", 
      icon: FileText 
    }] : []),
    ...(hasResults ? [{ 
      id: "analysis-results", 
      title: "Анализ по абзацам", 
      icon: List
    }] : []),
    ...(hasMissingRequirements ? [{
      id: "missing-requirements",
      title: "Отсутствующие требования",
      icon: AlertTriangle
    }] : []),
    ...(hasContradictions ? [{ 
      id: "contradictions-results", 
      title: "Противоречия", 
      icon: AlertTriangle
    }] : []),
    ...(hasRightsImbalance ? [{ 
      id: "rights-imbalance-results", 
      title: "Дисбаланс прав", 
      icon: Scale
    }] : []),
  ];

  // Отслеживание активного раздела при прокрутке
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Находим все видимые элементы
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        
        if (visibleEntries.length > 0) {
          // Сортируем по позиции на экране (самый верхний элемент)
          const sortedEntries = visibleEntries.sort((a, b) => {
            return a.boundingClientRect.top - b.boundingClientRect.top;
          });
          
          // Устанавливаем активным самый верхний видимый элемент
          setActiveSection(sortedEntries[0].target.id);
        }
      },
      {
        root: null,
        rootMargin: "-100px 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Очищаем предыдущие наблюдения
    const cleanupObserver = () => {
      observer.disconnect();
    };

    // Наблюдаем за всеми разделами
    const observeElements = () => {
      tocItems.forEach((item) => {
        const element = document.getElementById(item.id);
        if (element) {
          observer.observe(element);
        }
      });
    };

    // Небольшая задержка для инициализации элементов
    const timeoutId = setTimeout(observeElements, 100);

    return () => {
      clearTimeout(timeoutId);
      cleanupObserver();
    };
  }, [tocItems.length]);

  // Функция прокрутки к разделу
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const elementTop = element.offsetTop;
      const offsetTop = elementTop - 88; // Учитываем высоту заголовка
      
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
    }
  };

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-24">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Search className="mr-2 text-orange-600" size={20} />
        Оглавление
      </h3>
      
      <nav className="space-y-2">
        {tocItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center ${
                isActive
                  ? 'bg-orange-50 text-orange-800 border border-orange-200'
                  : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-orange-600' : 'text-gray-500'} />
              <span className="text-sm font-medium ml-2">{item.title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
} 