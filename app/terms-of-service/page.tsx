"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
  ArrowLeft,
  FileText,
  Users,
  AlertTriangle,
  CreditCard,
  Shield,
  Gavel,
} from "lucide-react";
import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Logo className="h-12 sm:h-16 w-auto" />
            <Button asChild variant="outline">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao Login
              </Link>
            </Button>
          </div>

          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <FileText className="h-16 w-16 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold">Termos de Uso</h1>
            <p className="text-lg text-muted-foreground">
              Dashboard Hud Lab - Última atualização:{" "}
              {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Aceitação dos Termos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                1. Aceitação dos Termos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Bem-vindo ao Dashboard Hud Lab. Estes Termos de Uso
                (&quot;Termos&quot;) regem o uso de nossos serviços de dashboard
                e análise de dados fornecidos pela Hud Lab (&quot;nós&quot;,
                &quot;nosso&quot; ou &quot;empresa&quot;).
              </p>
              <p>
                Ao acessar ou usar nossos serviços, você concorda em ficar
                vinculado a estes Termos. Se você não concordar com qualquer
                parte destes termos, não poderá acessar o serviço.
              </p>
            </CardContent>
          </Card>

          {/* Descrição do Serviço */}
          <Card>
            <CardHeader>
              <CardTitle>2. Descrição do Serviço</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                O Dashboard Hud Lab é uma plataforma de análise e gerenciamento
                de dados que oferece:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Sincronização e análise de dados de vendas</li>
                <li>Integração com plataformas de e-commerce (NuvemShop)</li>
                <li>Gestão de campanhas de marketing (ActiveCampaign)</li>
                <li>Relatórios e dashboards personalizados</li>
                <li>Controle de custos e métricas de performance</li>
                <li>Sistema de parceiros e afiliados</li>
              </ul>
            </CardContent>
          </Card>

          {/* Conta de Usuário */}
          <Card>
            <CardHeader>
              <CardTitle>3. Conta de Usuário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">3.1 Registro</h4>
                <p className="text-sm">
                  Para usar nossos serviços, você deve criar uma conta
                  fornecendo informações precisas e completas. Você é
                  responsável por manter a confidencialidade de suas credenciais
                  de acesso.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">3.2 Aprovação</h4>
                <p className="text-sm">
                  Novas contas estão sujeitas à aprovação administrativa.
                  Reservamo-nos o direito de recusar ou suspender contas a nosso
                  critério.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">3.3 Responsabilidades</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Manter informações de conta atualizadas e precisas</li>
                  <li>Proteger suas credenciais de acesso</li>
                  <li>Notificar imediatamente sobre uso não autorizado</li>
                  <li>Usar o serviço apenas para fins legítimos</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Uso Aceitável */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                4. Política de Uso Aceitável
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Você concorda em NÃO usar nossos serviços para:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Violar leis ou regulamentos aplicáveis</li>
                <li>Transmitir conteúdo malicioso, spam ou vírus</li>
                <li>Tentar acessar sistemas ou dados não autorizados</li>
                <li>Interferir no funcionamento normal do serviço</li>
                <li>Fazer engenharia reversa ou copiar nosso software</li>
                <li>Usar o serviço para competir conosco</li>
                <li>Compartilhar credenciais de acesso com terceiros</li>
              </ul>
            </CardContent>
          </Card>

          {/* Dados e Privacidade */}
          <Card>
            <CardHeader>
              <CardTitle>5. Dados e Privacidade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">5.1 Seus Dados</h4>
                <p className="text-sm">
                  Você mantém a propriedade de todos os dados que carrega ou
                  sincroniza através de nossos serviços. Concede-nos uma licença
                  limitada para processar esses dados conforme necessário para
                  fornecer o serviço.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">5.2 Proteção de Dados</h4>
                <p className="text-sm">
                  Comprometemo-nos a proteger seus dados de acordo com nossa
                  Política de Privacidade e as leis aplicáveis, incluindo a LGPD
                  (Lei Geral de Proteção de Dados).
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">5.3 Backup e Recuperação</h4>
                <p className="text-sm">
                  Embora façamos backups regulares, recomendamos que mantenha
                  cópias independentes de dados críticos. Não somos responsáveis
                  por perda de dados devido a falhas técnicas.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pagamentos e Faturamento */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                6. Pagamentos e Faturamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">6.1 Taxas</h4>
                <p className="text-sm">
                  O uso de nossos serviços pode estar sujeito a taxas conforme
                  especificado em seu plano de assinatura. As taxas são cobradas
                  antecipadamente e não são reembolsáveis, exceto quando exigido
                  por lei.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">6.2 Alterações de Preço</h4>
                <p className="text-sm">
                  Reservamo-nos o direito de alterar nossos preços mediante
                  aviso prévio de 30 dias. Alterações entrarão em vigor no
                  próximo ciclo de faturamento.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">
                  6.3 Suspensão por Não Pagamento
                </h4>
                <p className="text-sm">
                  O acesso aos serviços pode ser suspenso em caso de não
                  pagamento. Dados podem ser excluídos após 30 dias de
                  suspensão.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Limitações de Responsabilidade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                7. Limitações de Responsabilidade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">
                  7.1 Disponibilidade do Serviço
                </h4>
                <p className="text-sm">
                  Embora nos esforcemos para manter alta disponibilidade, não
                  garantimos que o serviço estará disponível 100% do tempo.
                  Manutenções programadas serão comunicadas com antecedência.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">7.2 Limitação de Danos</h4>
                <p className="text-sm">
                  Nossa responsabilidade total por qualquer reclamação
                  relacionada aos serviços não excederá o valor pago por você
                  nos 12 meses anteriores ao evento que deu origem à reclamação.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">7.3 Isenção de Garantias</h4>
                <p className="text-sm">
                  Os serviços são fornecidos &quot;como estão&quot; sem
                  garantias expressas ou implícitas. Não garantimos que o
                  serviço atenderá a todos os seus requisitos específicos.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Propriedade Intelectual */}
          <Card>
            <CardHeader>
              <CardTitle>8. Propriedade Intelectual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Todos os direitos de propriedade intelectual relacionados aos
                nossos serviços, incluindo software, design, marcas e conteúdo,
                pertencem à Hud Lab ou seus licenciadores.
              </p>
              <p className="text-sm">
                Você recebe uma licença limitada, não exclusiva e revogável para
                usar nossos serviços conforme estes Termos. Esta licença não
                inclui direitos de revenda ou distribuição.
              </p>
            </CardContent>
          </Card>

          {/* Rescisão */}
          <Card>
            <CardHeader>
              <CardTitle>9. Rescisão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">9.1 Rescisão por Você</h4>
                <p className="text-sm">
                  Você pode encerrar sua conta a qualquer momento através das
                  configurações de perfil ou entrando em contato conosco.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">9.2 Rescisão por Nós</h4>
                <p className="text-sm">
                  Podemos suspender ou encerrar sua conta por violação destes
                  Termos, não pagamento ou por outros motivos legítimos,
                  mediante aviso prévio quando possível.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">9.3 Efeitos da Rescisão</h4>
                <p className="text-sm">
                  Após a rescisão, seu acesso aos serviços cessará
                  imediatamente. Dados podem ser mantidos por período limitado
                  para fins de backup e conformidade legal.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Lei Aplicável */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5" />
                10. Lei Aplicável e Jurisdição
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Estes Termos são regidos pelas leis da República Federativa do
                Brasil. Qualquer disputa será resolvida nos tribunais
                competentes do Brasil.
              </p>
              <p className="text-sm">
                Tentaremos resolver disputas amigavelmente antes de recorrer a
                procedimentos legais formais.
              </p>
            </CardContent>
          </Card>

          {/* Alterações nos Termos */}
          <Card>
            <CardHeader>
              <CardTitle>11. Alterações nos Termos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Reservamo-nos o direito de modificar estes Termos a qualquer
                momento. Alterações significativas serão comunicadas através do
                email cadastrado ou por meio de aviso em nosso sistema.
              </p>
              <p className="text-sm">
                O uso continuado dos serviços após alterações constitui
                aceitação dos novos Termos.
              </p>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card>
            <CardHeader>
              <CardTitle>12. Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Para dúvidas sobre estes Termos ou nossos serviços, entre em
                contato:
              </p>
              <div className="space-y-2">
                <p className="text-sm">Email: contato@hudlab.com.br</p>
                <p className="text-sm">Telefone: +55 51 99856-7647</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            © 2025 Hud Lab. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
