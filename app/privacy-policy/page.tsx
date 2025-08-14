"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
  ArrowLeft,
  Shield,
  Eye,
  Lock,
  Database,
  Mail,
  Phone,
} from "lucide-react";
import Link from "next/link";

export default function PrivacyPolicyPage() {
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
              <Shield className="h-16 w-16 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold">
              Política de Privacidade
            </h1>
            <p className="text-lg text-muted-foreground">
              Dashboard Hud Lab - Última atualização:{" "}
              {new Date().toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Introdução */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                1. Introdução
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                A Hud Lab (&quot;nós&quot;, &quot;nosso&quot; ou
                &quot;empresa&quot;) está comprometida em proteger e respeitar
                sua privacidade. Esta Política de Privacidade explica como
                coletamos, usamos, armazenamos e protegemos suas informações
                pessoais quando você utiliza nosso Dashboard Hud Lab.
              </p>
              <p>
                Ao utilizar nossos serviços, você concorda com a coleta e uso de
                informações de acordo com esta política. As informações que
                coletamos são utilizadas para fornecer e melhorar nossos
                serviços.
              </p>
            </CardContent>
          </Card>

          {/* Informações Coletadas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                2. Informações que Coletamos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">2.1 Informações Pessoais</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Nome completo e informações de contato</li>
                  <li>Endereço de email e número de telefone</li>
                  <li>Informações de autenticação (senha criptografada)</li>
                  <li>Dados de perfil e preferências do usuário</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">2.2 Dados de Negócio</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Informações de vendas e transações</li>
                  <li>Dados de produtos e estoque</li>
                  <li>Métricas de performance e relatórios</li>
                  <li>
                    Dados de integração com plataformas terceiras
                    (ActiveCampaign, NuvemShop)
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">2.3 Dados Técnicos</h4>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Endereço IP e informações do dispositivo</li>
                  <li>Logs de acesso e atividade no sistema</li>
                  <li>Cookies e tecnologias similares</li>
                  <li>Dados de uso e navegação</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Como Usamos as Informações */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                3. Como Usamos suas Informações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>Utilizamos suas informações para:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Fornecer e manter nossos serviços de dashboard</li>
                <li>Processar e sincronizar dados de vendas e produtos</li>
                <li>Gerar relatórios e análises de performance</li>
                <li>Autenticar e autorizar acesso ao sistema</li>
                <li>Comunicar sobre atualizações e suporte técnico</li>
                <li>
                  Melhorar nossos serviços e desenvolver novas funcionalidades
                </li>
                <li>Cumprir obrigações legais e regulamentares</li>
              </ul>
            </CardContent>
          </Card>

          {/* Compartilhamento de Dados */}
          <Card>
            <CardHeader>
              <CardTitle>4. Compartilhamento de Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Não vendemos, alugamos ou compartilhamos suas informações
                pessoais com terceiros, exceto nas seguintes circunstâncias:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <strong>Prestadores de Serviços:</strong> Compartilhamos dados
                  com provedores de infraestrutura (Supabase, Vercel)
                  necessários para operação do sistema
                </li>
                <li>
                  <strong>Integrações Autorizadas:</strong> Dados são
                  sincronizados com plataformas que você conectou
                  (ActiveCampaign, NuvemShop)
                </li>
                <li>
                  <strong>Cumprimento Legal:</strong> Quando exigido por lei ou
                  para proteger nossos direitos legais
                </li>
                <li>
                  <strong>Consentimento:</strong> Quando você nos autoriza
                  expressamente
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Segurança */}
          <Card>
            <CardHeader>
              <CardTitle>5. Segurança dos Dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Implementamos medidas de segurança técnicas e organizacionais
                para proteger suas informações:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Criptografia de dados em trânsito e em repouso</li>
                <li>
                  Autenticação multifator e controle de acesso baseado em
                  funções
                </li>
                <li>Monitoramento contínuo de segurança e logs de auditoria</li>
                <li>Backups regulares e planos de recuperação de desastres</li>
                <li>Atualizações regulares de segurança</li>
              </ul>
            </CardContent>
          </Card>

          {/* Retenção de Dados */}
          <Card>
            <CardHeader>
              <CardTitle>6. Retenção de Dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Mantemos suas informações pessoais apenas pelo tempo necessário
                para cumprir os propósitos descritos nesta política, incluindo:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Enquanto sua conta estiver ativa</li>
                <li>Para cumprir obrigações legais e regulamentares</li>
                <li>Para resolver disputas e fazer cumprir nossos acordos</li>
                <li>
                  Por até 5 anos após o encerramento da conta para fins de
                  auditoria
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Direitos do Usuário */}
          <Card>
            <CardHeader>
              <CardTitle>7. Seus Direitos (LGPD)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem
                os seguintes direitos:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <strong>Acesso:</strong> Solicitar informações sobre o
                  tratamento de seus dados
                </li>
                <li>
                  <strong>Correção:</strong> Solicitar a correção de dados
                  incompletos ou inexatos
                </li>
                <li>
                  <strong>Exclusão:</strong> Solicitar a eliminação de dados
                  desnecessários ou tratados em desconformidade
                </li>
                <li>
                  <strong>Portabilidade:</strong> Solicitar a portabilidade de
                  dados a outro fornecedor
                </li>
                <li>
                  <strong>Oposição:</strong> Opor-se ao tratamento de dados
                </li>
                <li>
                  <strong>Revogação:</strong> Revogar o consentimento a qualquer
                  momento
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Contato */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                8. Contato
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Para exercer seus direitos ou esclarecer dúvidas sobre esta
                política, entre em contato:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>Email: contato@hudlab.com.br</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>Telefone: +55 51 99856-7647</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alterações */}
          <Card>
            <CardHeader>
              <CardTitle>9. Alterações nesta Política</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Podemos atualizar esta Política de Privacidade periodicamente.
                Notificaremos sobre mudanças significativas através do email
                cadastrado ou por meio de aviso em nosso sistema. Recomendamos
                que revise esta política regularmente.
              </p>
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
