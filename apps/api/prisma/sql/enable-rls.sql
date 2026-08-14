-- Row Level Security — a segunda barreira do multitenant.
--
-- A API já filtra tudo por `professorId` (ver CurrentProfessor). Isto aqui é a
-- rede embaixo: se um `where` esquecer o filtro, o Postgres recusa a linha em
-- vez de devolvê-la. Rode com: npm run prisma:rls
--
-- Nota importante sobre a API: o Prisma conecta como o dono das tabelas, e o
-- dono tem BYPASSRLS por padrão no Postgres — ou seja, estas policies NÃO
-- restringem a API. Elas protegem os acessos que passam pelo PostgREST do
-- Supabase (o cliente `supabase-js` no front, o painel, qualquer integração com
-- a anon key), que é exatamente onde um erro vazaria dado sem passar pelo nosso
-- código. Para valer também na API, use um role sem BYPASSRLS na DATABASE_URL.

-- ---------------------------------------------------------------------------
-- Tabelas com professor_id direto: a policy compara com o uid do JWT.
-- ---------------------------------------------------------------------------

ALTER TABLE professores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE escolas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadeiras           ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_aulas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_aula     ENABLE ROW LEVEL SECURITY;
ALTER TABLE configs_alarme     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anexos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- O cast para text não é decoração: `Professor.id` é String no Prisma, o que
-- vira `text` no Postgres, enquanto `auth.uid()` devolve `uuid`. Sem o cast o
-- CREATE POLICY falha com "operator does not exist: text = uuid".

DROP POLICY IF EXISTS professores_proprio ON professores;
CREATE POLICY professores_proprio ON professores
  USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'escolas', 'cadeiras', 'unidades', 'series_aulas', 'ocorrencias',
    'registros_aula', 'configs_alarme', 'anexos', 'notificacoes',
    'push_subscriptions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_proprio ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_proprio ON %I USING (professor_id = auth.uid()::text) WITH CHECK (professor_id = auth.uid()::text)',
      t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Tabelas sem professor_id: alcançam o dono por uma junção.
--
-- series_horarios e topicos não carregam professor_id de propósito — sempre são
-- lidos via o pai, e desnormalizar a coluna só para a policy criaria uma chance
-- de os dois divergirem.
-- ---------------------------------------------------------------------------

ALTER TABLE series_horarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE topicos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_topicos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS series_horarios_proprio ON series_horarios;
CREATE POLICY series_horarios_proprio ON series_horarios
  USING (EXISTS (
    SELECT 1 FROM series_aulas s
    WHERE s.id = series_horarios.serie_id AND s.professor_id = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM series_aulas s
    WHERE s.id = series_horarios.serie_id AND s.professor_id = auth.uid()::text
  ));

DROP POLICY IF EXISTS topicos_proprio ON topicos;
CREATE POLICY topicos_proprio ON topicos
  USING (EXISTS (
    SELECT 1 FROM unidades u
    WHERE u.id = topicos.unidade_id AND u.professor_id = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM unidades u
    WHERE u.id = topicos.unidade_id AND u.professor_id = auth.uid()::text
  ));

DROP POLICY IF EXISTS registros_topicos_proprio ON registros_topicos;
CREATE POLICY registros_topicos_proprio ON registros_topicos
  USING (EXISTS (
    SELECT 1 FROM registros_aula r
    WHERE r.id = registros_topicos.registro_id AND r.professor_id = auth.uid()::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM registros_aula r
    WHERE r.id = registros_topicos.registro_id AND r.professor_id = auth.uid()::text
  ));
