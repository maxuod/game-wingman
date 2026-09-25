import type { CompGuide, Observation } from '../shared/types.js';

export interface CoachingStep { title: string; detail: string }

// Only use fields actually observed on a recent frame. The public comp guide is
// a final-board reference; it does not tell us the player's shop or opponents.
export function coachingStep(guide: CompGuide | null, fields: Observation | null, currentGuide: boolean): CoachingStep {
  if (!guide) return { title: '先选一套阵容', detail: '从上方四套阵容中选一个目标，我会按它的核心棋子和装备给出本局提示。' };
  if (!currentGuide) return { title: '等待阵容资料更新', detail: '这套阵容的统计已过期或与当前补丁不符，先刷新排名再继续跟进。' };
  if (!fields) return { title: '等待本局信息', detail: `已选 ${guide.name}。连接游戏并开启跟进后，会根据阶段、金币、生命和装备更新建议。` };
  const stage = /^([1-9])-([1-9])$/.exec(fields.stage ?? '');
  if (!stage) return { title: '核对当前阶段', detail: '画面里的阶段尚未读清；先看所选阵容的目标配装，等下一次识别后再给阶段建议。' };
  const round = Number(stage[1]);
  const core = guide.core[0] ?? '核心棋子';
  if (round >= 3 && fields.hp !== null && fields.hp <= 35)
    return { title: '先稳住血量', detail: `当前生命 ${fields.hp}。优先检查前排和现有成装，把可用装备交给 ${core} 或过渡棋；不要只等终盘棋子。` };
  if (round <= 2)
    return { title: '先稳过渡，留核心方向', detail: `目标核心是 ${core}。现在优先用手头棋子保证场面，留意适合它的散件；终盘站位不等于当前必须上场的棋子。` };
  if (round === 3 && fields.gold !== null && fields.gold >= 50)
    return { title: '保持经济，观察转阵时机', detail: `当前 ${fields.gold} 金币。围绕 ${core} 留牌和准备配装；是否升人口或搜牌，还要看商店、场面强度与来牌。` };
  if (round === 3)
    return { title: '补强当前棋盘', detail: `继续向 ${core} 的配装靠拢。先核对当前前排和可合成装备，避免在未看到商店时盲目搜牌。` };
  return { title: '对照阵容补齐核心', detail: `进入中后期，优先检查 ${core} 的装备、前排和站位；根据实际来牌调整，不必机械照搬终盘棋盘。` };
}
