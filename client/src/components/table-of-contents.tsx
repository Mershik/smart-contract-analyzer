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
  const [clickedSection, setClickedSection] = useState<string>(""); // Для отслеживания кликнутого элемента

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
          const newActiveSection = sortedEntries[0].target.id;
          
          // Обновляем только если это действительно новый раздел
          setActiveSection(prev => {
            if (prev !== newActiveSection) {
              return newActiveSection;
            }
            return prev;
          });
        }
      },
      {
        root: null,
        rootMargin: "-80px 0px -50% 0px", // Уменьшили отступы для лучшего срабатывания
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], // Добавили больше точек срабатывания
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

    // Дополнительная логика для отслеживания прокрутки
    const handleScroll = () => {
      // Находим раздел, который ближе всего к верху экрана
      let closestSection = '';
      let closestDistance = Infinity;
      
      tocItems.forEach((item) => {
        const element = document.getElementById(item.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          const distance = Math.abs(rect.top - 100); // 100px от верха экрана
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestSection = item.id;
          }
        }
      });
      
      if (closestSection) {
        setActiveSection(closestSection);
      }
    };

    // Добавляем обработчик прокрутки с throttling
    let scrollTimeout: NodeJS.Timeout;
    const throttledScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };
    
    window.addEventListener('scroll', throttledScroll);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', throttledScroll);
      cleanupObserver();
    };
  }, [tocItems.length]);

  // Функция прокрутки к разделу
  const scrollToSection = (sectionId: string) => {
    // Сразу устанавливаем активный раздел для мгновенной обратной связи
    setActiveSection(sectionId);
    setClickedSection(sectionId);
    
    const element = document.getElementById(sectionId);
    if (element) {
      const elementTop = element.offsetTop;
      const offsetTop = elementTop - 88; // Учитываем высоту заголовка
      
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      });
      
      // Сбрасываем состояние клика через небольшую задержку
      setTimeout(() => {
        setClickedSection("");
      }, 1000);
    }
  };

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Search className="mr-2 text-orange-600" size={20} />
        Оглавление
      </h3>
      
      <nav className="space-y-2">
        {tocItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const isClicked = clickedSection === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center ${
                isActive || isClicked
                  ? 'bg-orange-50 text-orange-800 border border-orange-200 shadow-sm'
                  : 'hover:bg-gray-50 text-gray-700 border border-transparent'
              }`}
            >
              <Icon size={16} className={isActive || isClicked ? 'text-orange-600' : 'text-gray-500'} />
              <span className="text-sm font-medium ml-2">{item.title}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
} 