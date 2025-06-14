import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface EditableCommentProps {
  comment: string;
  onSave: (newComment: string) => void;
  className?: string;
}

export function EditableComment({ comment, onSave, className = "" }: EditableCommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedComment, setEditedComment] = useState(comment);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedComment(comment);
  };

  const handleSave = () => {
    onSave(editedComment);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedComment(comment);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Textarea
          value={editedComment}
          onChange={(e) => setEditedComment(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[80px] text-sm"
          placeholder="Введите комментарий..."
          autoFocus
        />
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1"
          >
            <Check size={14} className="mr-1" />
            Сохранить
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            className="px-3 py-1"
          >
            <X size={14} className="mr-1" />
            Отмена
          </Button>
          <span className="text-xs text-gray-500">
            Ctrl+Enter для сохранения, Esc для отмены
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative ${className}`}>
      <p className="text-sm leading-relaxed">{comment}</p>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleStartEdit}
        className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
      >
        <Edit2 size={12} className="text-gray-400 hover:text-gray-600" />
      </Button>
    </div>
  );
} 