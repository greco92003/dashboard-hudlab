-- Adicionar política RLS para permitir DELETE na tabela user_notifications
-- Usuários podem deletar suas próprias notificações

CREATE POLICY "Users can delete their own notifications" ON user_notifications
  FOR DELETE USING (user_id = auth.uid());
