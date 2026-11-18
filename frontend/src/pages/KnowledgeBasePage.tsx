import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  Search,
  Tag,
  ThumbsUp,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../services/api";
import { CategoryItem, KnowledgeArticleItem } from "../types";
import { formatDateTime } from "../utils/format";

export const KnowledgeBasePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === "agent" || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [includeUnpublished, setIncludeUnpublished] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticleItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticleItem | null>(null);

  // Form state for create/edit
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(true);

  const { data: categories } = useQuery<CategoryItem[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => apiRequest<CategoryItem[]>("/tickets/categories"),
  });

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (selectedCategory !== "all") params.set("category_id", selectedCategory);
    if (isStaff && includeUnpublished) params.set("include_unpublished", "true");
    return params.toString();
  };

  const { data: articles, isLoading } = useQuery<KnowledgeArticleItem[]>({
    queryKey: ["knowledge-articles", search, selectedCategory, includeUnpublished],
    queryFn: () => apiRequest<KnowledgeArticleItem[]>(`/knowledge?${buildQuery()}`),
  });

  const openArticleReader = async (article: KnowledgeArticleItem) => {
    try {
      const fresh = await apiRequest<KnowledgeArticleItem>(`/knowledge/${article.id}`);
      setSelectedArticle(fresh);
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    } catch {
      setSelectedArticle(article);
    }
  };

  const helpfulMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<KnowledgeArticleItem>(`/knowledge/${id}/helpful`, { method: "POST" }),
    onSuccess: (updated) => {
      setSelectedArticle(updated);
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    },
  });

  const saveArticleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        summary,
        content,
        category_id: categoryId ? Number(categoryId) : null,
        tags,
        is_published: isPublished,
      };
      if (editingArticle) {
        return apiRequest<KnowledgeArticleItem>(`/knowledge/${editingArticle.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest<KnowledgeArticleItem>("/knowledge", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (saved) => {
      setEditorOpen(false);
      setEditingArticle(null);
      setSelectedArticle(saved);
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: (article: KnowledgeArticleItem) =>
      apiRequest<KnowledgeArticleItem>(`/knowledge/${article.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_published: !article.is_published }),
      }),
    onSuccess: (updated) => {
      if (selectedArticle?.id === updated.id) setSelectedArticle(updated);
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    },
  });

  const openCreateModal = () => {
    setEditingArticle(null);
    setTitle("");
    setSummary("");
    setContent("");
    setCategoryId(categories?.[0]?.id ? String(categories[0].id) : "");
    setTags("");
    setIsPublished(true);
    setEditorOpen(true);
  };

  const openEditModal = (art: KnowledgeArticleItem) => {
    setEditingArticle(art);
    setTitle(art.title);
    setSummary(art.summary);
    setContent(art.content);
    setCategoryId(art.category_id ? String(art.category_id) : "");
    setTags(art.tags.join(", "));
    setIsPublished(art.is_published);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Enterprise Knowledge Base
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Self-service troubleshooting guides, corporate IT policies, and standard operating procedures.
          </p>
        </div>
        {isStaff && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            New Knowledge Article
          </button>
        )}
      </div>

      {/* Search & Category Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles by keyword (e.g. Okta password, GlobalProtect VPN, Wi-Fi 802.1X, YubiKey)..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:bg-white"
            />
          </div>

          {isStaff && (
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={includeUnpublished}
                onChange={(e) => setIncludeUnpublished(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Show Unpublished Drafts
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              selectedCategory === "all"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Categories
          </button>
          {categories?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(String(c.id))}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                selectedCategory === String(c.id)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (articles || []).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-800">No knowledge base articles found</p>
          <p className="text-xs text-slate-500 mt-1">
            Try clearing your search or selecting a different category.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles?.map((art) => (
            <div
              key={art.id}
              onClick={() => openArticleReader(art)}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-200">
                    {art.category_name || "General IT"}
                  </span>
                  {!art.is_published && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-semibold">
                      <EyeOff className="w-3 h-3" />
                      Draft
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {art.title}
                </h3>
                <p className="text-xs text-slate-600 mt-2 line-clamp-3 leading-relaxed">
                  {art.summary}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                {art.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {art.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {art.view_count} views
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                    <ThumbsUp className="w-3 h-3" />
                    {art.helpful_count} helpful
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Article Reader Drawer / Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                  {selectedArticle.category_name || "General IT"}
                </span>
                {!selectedArticle.is_published && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-semibold">
                    Unpublished Draft
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isStaff && (
                  <>
                    <button
                      onClick={() => togglePublishMutation.mutate(selectedArticle)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      {selectedArticle.is_published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() => {
                        const art = selectedArticle;
                        setSelectedArticle(null);
                        openEditModal(art);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Article
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <h2 className="text-xl font-bold text-slate-900">{selectedArticle.title}</h2>
              <p className="text-xs text-slate-500">
                Authored by <strong>{selectedArticle.author_name}</strong> • Updated{" "}
                {formatDateTime(selectedArticle.updated_at)} • {selectedArticle.view_count} views
              </p>

              <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-slate-700 font-medium">
                {selectedArticle.summary}
              </div>

              <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed pt-2">
                {selectedArticle.content}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">
                Did this article resolve your technical issue?
              </span>
              <button
                onClick={() => helpfulMutation.mutate(selectedArticle.id)}
                disabled={helpfulMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Yes, Helpful ({selectedArticle.helpful_count})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Knowledge Article Modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingArticle ? "Edit Knowledge Base Article" : "Create Knowledge Base Article"}
              </h3>
              <button onClick={() => setEditorOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Article title..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="">General IT</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase text-slate-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="vpn, okta, password"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Executive Summary *
                </label>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief 1-2 sentence summary..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold uppercase text-slate-700 mb-1">
                  Article Content (Markdown supported) *
                </label>
                <textarea
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Detailed step-by-step instructions..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                Publish immediately to Employee Knowledge Base
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveArticleMutation.mutate()}
                disabled={
                  title.trim().length < 5 ||
                  summary.trim().length < 10 ||
                  content.trim().length < 20 ||
                  saveArticleMutation.isPending
                }
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {saveArticleMutation.isPending ? "Saving..." : "Save Article"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
