import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { SPANISH_RECIPES } from '../data/spanishRecipes';
import type { SpanishRecipe, SRecipeCategory, SDietType } from '../types';
import {
  Search, ArrowLeft, ChefHat, Clock, Flame, Dumbbell, X,
  ChevronDown, ChevronUp, Wind, Leaf, Euro, Snowflake, Sun,
  CloudRain, Flower2, CalendarDays, MapPin, AlertTriangle,
  Tag, UtensilsCrossed, Heart, ChevronLeft, ChevronRight,
  SlidersHorizontal, BarChart3,
} from 'lucide-react';

const ITEMS_PER_PAGE = 24;

const CATEGORY_LABELS: Record<SRecipeCategory | 'all' | 'airfryer', string> = {
  all: 'Todos',
  breakfast: 'Desayunos',
  mid_morning: 'Media Mañana',
  lunch: 'Comidas',
  snack: 'Meriendas',
  dinner: 'Cenas',
  airfryer: 'Airfryer',
};

const CATEGORY_COLORS: Record<SRecipeCategory, { bg: string; text: string; border: string }> = {
  breakfast: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  mid_morning: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  lunch: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  snack: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  dinner: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const CATEGORY_CHIP_COLORS: Record<SRecipeCategory | 'all' | 'airfryer', string> = {
  all: 'bg-slate-600 text-white',
  breakfast: 'bg-amber-500 text-white',
  mid_morning: 'bg-green-500 text-white',
  lunch: 'bg-blue-500 text-white',
  snack: 'bg-purple-500 text-white',
  dinner: 'bg-indigo-500 text-white',
  airfryer: 'bg-orange-500 text-white',
};

const DIET_LABELS: Record<SDietType | 'all', string> = {
  all: 'Todas',
  omnivore: 'Omnívora',
  vegetarian: 'Vegetariana',
  vegan: 'Vegana',
  pescetarian: 'Pescetariana',
  mediterranean: 'Mediterránea',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  all: 'Todas',
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

const BUDGET_LABELS: Record<string, string> = {
  all: 'Todos',
  low: 'Económico',
  medium: 'Moderado',
  high: 'Premium',
};

const BUDGET_ICONS: Record<string, string> = {
  low: '€',
  medium: '€€',
  high: '€€€',
};

const SEASON_LABELS: Record<string, string> = {
  all: 'Todas',
  spring: 'Primavera',
  summer: 'Verano',
  autumn: 'Otoño',
  winter: 'Invierno',
};

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: 'Gluten',
  lactosa: 'Lactosa',
  huevos: 'Huevos',
  frutos_secos: 'Frutos secos',
  pescado: 'Pescado',
  mariscos: 'Mariscos',
  soja: 'Soja',
  sesamo: 'Sésamo',
  mostaza: 'Mostaza',
  apio: 'Apio',
};

export const RecipeLibrary: React.FC = () => {
  const navigate = useNavigate();

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SRecipeCategory | 'all' | 'airfryer'>('all');
  const [dietFilter, setDietFilter] = useState<SDietType | 'all'>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [budgetFilter, setBudgetFilter] = useState<string>('all');
  const [athleteFilter, setAthleteFilter] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Modal
  const [selectedRecipe, setSelectedRecipe] = useState<SpanishRecipe | null>(null);

  const filteredRecipes = useMemo(() => {
    let recipes = [...SPANISH_RECIPES];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      recipes = recipes.filter(r => r.name.toLowerCase().includes(query));
    }

    // Category filter
    if (categoryFilter === 'airfryer') {
      recipes = recipes.filter(r => r.isAirfryer);
    } else if (categoryFilter !== 'all') {
      recipes = recipes.filter(r => r.category === categoryFilter);
    }

    // Diet filter
    if (dietFilter !== 'all') {
      recipes = recipes.filter(r => r.dietTypes.includes(dietFilter));
    }

    // Difficulty filter
    if (difficultyFilter !== 'all') {
      recipes = recipes.filter(r => r.difficulty === difficultyFilter);
    }

    // Budget filter
    if (budgetFilter !== 'all') {
      recipes = recipes.filter(r => r.budget === budgetFilter);
    }

    // Athlete filter
    if (athleteFilter) {
      recipes = recipes.filter(r => r.forAthletes);
    }

    // Season filter
    if (seasonFilter !== 'all') {
      recipes = recipes.filter(r => r.season.includes(seasonFilter as any) || r.season.includes('all'));
    }

    return recipes;
  }, [searchQuery, categoryFilter, dietFilter, difficultyFilter, budgetFilter, athleteFilter, seasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecipes.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecipes = filteredRecipes.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const updateCategoryFilter = (val: SRecipeCategory | 'all' | 'airfryer') => {
    setCategoryFilter(val);
    handleFilterChange();
  };

  const updateDietFilter = (val: SDietType | 'all') => {
    setDietFilter(val);
    handleFilterChange();
  };

  const updateDifficultyFilter = (val: string) => {
    setDifficultyFilter(val);
    handleFilterChange();
  };

  const updateBudgetFilter = (val: string) => {
    setBudgetFilter(val);
    handleFilterChange();
  };

  const updateAthleteFilter = (val: boolean) => {
    setAthleteFilter(val);
    handleFilterChange();
  };

  const updateSeasonFilter = (val: string) => {
    setSeasonFilter(val);
    handleFilterChange();
  };

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const SeasonIcon: React.FC<{ season: string; className?: string }> = ({ season, className }) => {
    switch (season) {
      case 'spring': return <Flower2 className={className} />;
      case 'summer': return <Sun className={className} />;
      case 'autumn': return <CloudRain className={className} />;
      case 'winter': return <Snowflake className={className} />;
      default: return <CalendarDays className={className} />;
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/nutrition')}
            className="p-2 rounded-lg hover:bg-slate-100 transition text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-orange-500" />
              Biblioteca de Recetas
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Explora y busca entre todas las recetas disponibles
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar recetas por nombre..."
            className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-300 placeholder:italic placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(CATEGORY_LABELS) as (SRecipeCategory | 'all' | 'airfryer')[]).map((cat) => (
            <button
              key={cat}
              onClick={() => updateCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                categoryFilter === cat
                  ? CATEGORY_CHIP_COLORS[cat]
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'airfryer' && <Wind className="w-3 h-3 inline mr-1" />}
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Diet Filter Chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(DIET_LABELS) as (SDietType | 'all')[]).map((diet) => (
            <button
              key={diet}
              onClick={() => updateDietFilter(diet)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                dietFilter === diet
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {diet !== 'all' && <Leaf className="w-3 h-3 inline mr-1" />}
              {DIET_LABELS[diet]}
            </button>
          ))}
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="flex items-center gap-2 px-3 py-1.5 mb-3 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Más filtros
          {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-4">
            {/* Difficulty */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Dificultad</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(DIFFICULTY_LABELS).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => updateDifficultyFilter(diff)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      difficultyFilter === diff
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {DIFFICULTY_LABELS[diff]}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Presupuesto</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(BUDGET_LABELS).map((bud) => (
                  <button
                    key={bud}
                    onClick={() => updateBudgetFilter(bud)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      budgetFilter === bud
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {BUDGET_LABELS[bud]}
                  </button>
                ))}
              </div>
            </div>

            {/* Season */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Temporada</label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(SEASON_LABELS).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSeasonFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1 ${
                      seasonFilter === s
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s !== 'all' && <SeasonIcon season={s} className="w-3 h-3" />}
                    {SEASON_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* For Athletes Toggle */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-600">Solo para deportistas</label>
              <button
                onClick={() => updateAthleteFilter(!athleteFilter)}
                className={`relative w-10 h-5 rounded-full transition ${
                  athleteFilter ? 'bg-orange-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    athleteFilter ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        <div className="flex items-center gap-4 mb-4 px-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>
              Total: <span className="font-semibold text-slate-700">{SPANISH_RECIPES.length}</span> recetas
            </span>
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="text-xs text-slate-500">
            Mostrando: <span className="font-semibold text-slate-700">{filteredRecipes.length}</span> recetas
          </div>
          {filteredRecipes.length !== SPANISH_RECIPES.length && (
            <>
              <div className="w-px h-4 bg-slate-200" />
              <div className="text-xs text-orange-600 font-medium">
                Filtros activos
              </div>
            </>
          )}
        </div>

        {/* Recipe Grid */}
        {paginatedRecipes.length === 0 ? (
          <div className="text-center py-16">
            <ChefHat className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No se encontraron recetas</p>
            <p className="text-slate-400 text-sm mt-1">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {paginatedRecipes.map((recipe) => {
              const catColor = CATEGORY_COLORS[recipe.category];
              return (
                <button
                  key={recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:shadow-md hover:border-slate-300 transition group"
                >
                  {/* Top badges row */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                      {CATEGORY_LABELS[recipe.category]}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[recipe.difficulty]}`}>
                      {DIFFICULTY_LABELS[recipe.difficulty]}
                    </span>
                    {recipe.isAirfryer && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        <Wind className="w-2.5 h-2.5 inline mr-0.5" />
                        Airfryer
                      </span>
                    )}
                    {recipe.forAthletes && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                        <Dumbbell className="w-2.5 h-2.5 inline mr-0.5" />
                        Deportista
                      </span>
                    )}
                  </div>

                  {/* Recipe name */}
                  <h3 className="text-sm font-semibold text-slate-800 group-hover:text-orange-600 transition mb-2 line-clamp-2 leading-snug">
                    {recipe.name}
                  </h3>

                  {/* Macros row */}
                  <div className="grid grid-cols-4 gap-1 mb-2">
                    <div className="text-center">
                      <div className="text-[10px] text-slate-400">kcal</div>
                      <div className="text-xs font-bold text-slate-700">{recipe.calories}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-slate-400">Prot</div>
                      <div className="text-xs font-bold text-blue-600">{recipe.protein}g</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-slate-400">Carb</div>
                      <div className="text-xs font-bold text-amber-600">{recipe.carbs}g</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-slate-400">Grasa</div>
                      <div className="text-xs font-bold text-rose-600">{recipe.fat}g</div>
                    </div>
                  </div>

                  {/* Bottom info row */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {recipe.prepTime + recipe.cookTime} min
                    </span>
                    <span className="font-medium text-slate-500">
                      {BUDGET_ICONS[recipe.budget]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pb-6">
            <button
              onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => {
                if (totalPages <= 7) return true;
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - safePage) <= 1) return true;
                return false;
              })
              .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                if (idx > 0) {
                  const prev = arr[idx - 1];
                  if (page - prev > 1) acc.push('ellipsis');
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-1 text-slate-400 text-sm">...</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition ${
                      safePage === item
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Recipe Detail Modal */}
      {selectedRecipe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedRecipe(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 rounded-t-2xl flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{selectedRecipe.name}</h2>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[selectedRecipe.category].bg} ${CATEGORY_COLORS[selectedRecipe.category].text} ${CATEGORY_COLORS[selectedRecipe.category].border}`}>
                    {CATEGORY_LABELS[selectedRecipe.category]}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[selectedRecipe.difficulty]}`}>
                    {DIFFICULTY_LABELS[selectedRecipe.difficulty]}
                  </span>
                  {selectedRecipe.isAirfryer && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      Airfryer
                    </span>
                  )}
                  {selectedRecipe.forAthletes && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                      Deportista
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedRecipe(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* Quick Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Clock className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Preparación</div>
                  <div className="text-sm font-bold text-slate-700">{selectedRecipe.prepTime} min</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Flame className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Cocción</div>
                  <div className="text-sm font-bold text-slate-700">{selectedRecipe.cookTime} min</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <UtensilsCrossed className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Raciones</div>
                  <div className="text-sm font-bold text-slate-700">{selectedRecipe.servings}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Euro className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                  <div className="text-xs text-slate-500">Presupuesto</div>
                  <div className="text-sm font-bold text-slate-700">{BUDGET_LABELS[selectedRecipe.budget]}</div>
                </div>
              </div>

              {/* Macros */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Información Nutricional</h3>
                <div className="grid grid-cols-5 gap-2">
                  <div className="bg-orange-50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-orange-500 font-medium">Calorías</div>
                    <div className="text-sm font-bold text-orange-700">{selectedRecipe.calories}</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-blue-500 font-medium">Proteína</div>
                    <div className="text-sm font-bold text-blue-700">{selectedRecipe.protein}g</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-amber-500 font-medium">Carbos</div>
                    <div className="text-sm font-bold text-amber-700">{selectedRecipe.carbs}g</div>
                  </div>
                  <div className="bg-rose-50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-rose-500 font-medium">Grasa</div>
                    <div className="text-sm font-bold text-rose-700">{selectedRecipe.fat}g</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2.5 text-center">
                    <div className="text-[10px] text-green-500 font-medium">Fibra</div>
                    <div className="text-sm font-bold text-green-700">{selectedRecipe.fiber}g</div>
                  </div>
                </div>
              </div>

              {/* Ingredients */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ingredientes</h3>
                <ul className="space-y-1.5">
                  {selectedRecipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                      <span className="text-slate-700">
                        <span className="font-medium">{ing.quantity}</span> {ing.name}
                        {ing.optional && (
                          <span className="text-slate-400 text-xs ml-1">(opcional)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Instructions */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Instrucciones</h3>
                <ol className="space-y-2">
                  {selectedRecipe.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-slate-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Diet Compatibilities */}
              {selectedRecipe.dietTypes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Dietas Compatibles</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecipe.dietTypes.map((diet) => (
                      <span key={diet} className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-medium">
                        <Heart className="w-3 h-3 inline mr-1" />
                        {DIET_LABELS[diet] || diet}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Allergens */}
              {selectedRecipe.allergens.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Alérgenos</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecipe.allergens.map((allergen) => (
                      <span key={allergen} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        {ALLERGEN_LABELS[allergen] || allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {selectedRecipe.tags.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Etiquetas</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedRecipe.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                        <Tag className="w-3 h-3 inline mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Season */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Temporada</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRecipe.season.map((s) => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 font-medium flex items-center gap-1">
                      <SeasonIcon season={s} className="w-3 h-3" />
                      {SEASON_LABELS[s] || s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Region */}
              {selectedRecipe.region && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Región</h3>
                  <span className="text-sm text-slate-700 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedRecipe.region}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
