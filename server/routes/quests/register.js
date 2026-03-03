'use strict';

function stripTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.!?]+$/g, '').trim();
}

module.exports = function registerQuestRoutes(app, deps) {
  const {
    requireSession,
    setSession,
    refreshBoard,
    acceptQuest,
    acceptQuestByIndex,
    buildBoardDisplayData
  } = deps;

  app.get('/api/quests/board', requireSession, (req, res) => {
    res.json({ success: true, board: buildBoardDisplayData(req.session.state) });
  });

  app.post('/api/quests/refresh', requireSession, (req, res) => {
    refreshBoard(req.session.state);
    setSession(req.sessionId, req.session);
    res.json({ success: true, board: buildBoardDisplayData(req.session.state) });
  });

  app.post('/api/quests/accept', requireSession, (req, res) => {
    const state = req.session.state;
    const { questIndex, questId } = req.body;
    const normalizedQuestId = stripTrailingPunctuation(questId);
    const indexText = stripTrailingPunctuation(questIndex);
    const indexMatch = indexText.match(/(\d+)/);
    const parsedIndex = indexMatch ? parseInt(indexMatch[1], 10) : NaN;
    const result = normalizedQuestId ? acceptQuest(state, normalizedQuestId) : acceptQuestByIndex(state, parsedIndex);
    setSession(req.sessionId, req.session);
    res.json({ success: result.success, message: result.message, quest: result.quest, board: buildBoardDisplayData(state) });
  });

  app.post('/api/quests/abandon', requireSession, (req, res) => {
    const state = req.session.state;
    const { questId } = req.body;
    if (!questId || !state.activeQuests) return res.json({ success: false });
    const idx = state.activeQuests.findIndex(q => q.id === questId);
    if (idx !== -1) state.activeQuests.splice(idx, 1);
    setSession(req.sessionId, req.session);
    res.json({ success: true, board: buildBoardDisplayData(state) });
  });
};
