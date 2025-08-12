module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'domain-independence',
      comment: 'Domain layer should not depend on infrastructure or presentation',
      severity: 'error',
      from: { path: '^src/.*domain.*' },
      to: { path: '^src/.*(infrastructure|presentation|delivery).*' }
    },
    {
      name: 'application-layer-rules',
      comment: 'Application layer should not depend on infrastructure specifics',
      severity: 'error', 
      from: { path: '^src/.*application.*' },
      to: { path: '^src/.*(infrastructure|presentation|delivery).*' }
    },
    {
      name: 'no-orphans',
      comment: 'No orphaned modules',
      severity: 'warn',
      from: { orphan: true },
      to: {}
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json'
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      }
    }
  }
};