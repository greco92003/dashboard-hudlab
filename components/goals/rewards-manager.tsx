"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Gift, Save, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Reward {
  id: string;
  description: string;
  saved?: boolean;
}

interface RewardsManagerProps {
  rewards: Reward[];
  onChange: (rewards: Reward[]) => void;
  disabled?: boolean;
}

export function RewardsManager({
  rewards,
  onChange,
  disabled = false,
}: RewardsManagerProps) {
  const [localRewards, setLocalRewards] = useState<Reward[]>(rewards);
  const [savedRewards, setSavedRewards] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLocalRewards(rewards);
    // Marcar premiações existentes como salvas
    setSavedRewards(new Set(rewards.map((r) => r.id)));
  }, [rewards]);

  const generateId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const addReward = () => {
    const newReward: Reward = {
      id: generateId(),
      description: "",
    };
    const updatedRewards = [...localRewards, newReward];
    setLocalRewards(updatedRewards);
    onChange(updatedRewards);
  };

  const removeReward = (id: string) => {
    const updatedRewards = localRewards.filter((reward) => reward.id !== id);
    setLocalRewards(updatedRewards);
    onChange(updatedRewards);
  };

  const updateReward = (id: string, description: string) => {
    const updatedRewards = localRewards.map((reward) =>
      reward.id === id ? { ...reward, description } : reward
    );
    setLocalRewards(updatedRewards);
    // Remove da lista de salvos quando editado
    setSavedRewards((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    onChange(updatedRewards);
  };

  const saveReward = (id: string) => {
    const reward = localRewards.find((r) => r.id === id);
    if (reward && reward.description.trim()) {
      setSavedRewards((prev) => new Set(prev).add(id));
      onChange(localRewards);
    }
  };

  const hasEmptyReward = localRewards.some(
    (reward) => !reward.description.trim()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Premiações para Meta Batida *
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addReward}
          disabled={disabled || hasEmptyReward}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Premiação
        </Button>
      </div>

      {localRewards.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Gift className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              Nenhuma premiação adicionada ainda
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={addReward}
              disabled={disabled}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Primeira Premiação
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {localRewards.map((reward, index) => {
          const isSaved = savedRewards.has(reward.id);
          const hasContent = reward.description.trim().length > 0;

          return (
            <Card key={reward.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label
                    htmlFor={`reward-${reward.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    Premiação {index + 1}
                    {isSaved && (
                      <span className="text-green-600 ml-1">✓ Salva</span>
                    )}
                  </Label>
                  <Input
                    id={`reward-${reward.id}`}
                    value={reward.description}
                    onChange={(e) => updateReward(reward.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && hasContent) {
                        e.preventDefault();
                        saveReward(reward.id);
                      }
                    }}
                    placeholder="Ex: Bônus de R$ 500, Folga extra, Vale-presente..."
                    disabled={disabled}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  {!isSaved && hasContent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => saveReward(reward.id)}
                      disabled={disabled}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      title="Salvar premiação (Enter)"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                  {isSaved && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-green-600 bg-green-50"
                      title="Premiação salva"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReward(reward.id)}
                    disabled={disabled || localRewards.length === 1}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {localRewards.length > 0 && hasEmptyReward && (
        <p className="text-xs text-amber-600">
          Preencha todas as premiações antes de adicionar uma nova.
        </p>
      )}

      {localRewards.length === 0 && (
        <p className="text-xs text-red-600">
          Pelo menos uma premiação é obrigatória.
        </p>
      )}
    </div>
  );
}
