import type { SaveData } from '../game/types';
import { GAME_TITLE, GAME_TITLE_EN, GAME_VERSION } from '../game/data/constants';
import { formatDuration, formatNumber } from '../game/meta/format';
import { artUrl } from './art';
import { PixelButton } from './components/UI';
import { PixelIcon } from './components/PixelIcon';
import { AudioMeter } from './components/AudioMeter';

export function TitleScreen({
  save,
  onContinue,
  onNew,
  onSettings,
  onCredits,
}: {
  save: SaveData | null;
  onContinue: () => void;
  onNew: () => void;
  onSettings: () => void;
  onCredits: () => void;
}) {
  return (
    <div className="title-screen">
      <div className="title-screen__bg" style={{ backgroundImage: `url(${artUrl('title_splash')})` }} />
      <div className="title-screen__shade" />
      <div className="title-screen__scanlines" />
      <div className="title-screen__embers" aria-hidden>
        {Array.from({ length: 18 }).map((_, index) => (
          <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${index * 0.6}s`, animationDuration: `${6 + (index % 5)}s` }} />
        ))}
      </div>

      <header className="title-topbar">
        <div className="title-brand">
          <PixelIcon name="aquila" size={26} />
          <div>
            <b>审判庭 · 第 XLI 远征档案</b>
            <span>INQUISITION FIELD ARCHIVE // CLEARANCE VERMILION</span>
          </div>
        </div>
        <div className="title-topbar__right">
          <AudioMeter compact className="title-audio" />
          <span className="fan-badge">非官方同人作品 · FAN-MADE</span>
          <button className="title-icon-btn" onClick={onSettings} title="设置">
            <PixelIcon name="settings" size={20} />
          </button>
        </div>
      </header>

      <main className="title-main">
        <div className="title-kicker">
          <span className="title-rule" />
          <span>WARHAMMER 40,000</span>
          <span className="title-rule" />
        </div>
        <h1 className="game-title">
          <span className="game-title__small">战锤 40,000</span>
          <span className="game-title__main">{GAME_TITLE}</span>
        </h1>
        <div className="title-english">{GAME_TITLE_EN}</div>
        <p className="title-tagline">“你不是战士。你是坐标。”</p>
        <p className="title-desc">
          移动、躲闪、向轨道呼叫死亡。把异形与异端从这颗星球上抹去，
          <br className="desktop-only" />
          然后用它们的残骸铸成下一把武器。
        </p>

        <div className="title-actions">
          {save ? (
            <PixelButton variant="primary" size="lg" icon={<PixelIcon name="play" size={18} />} onClick={onContinue}>
              继续远征
            </PixelButton>
          ) : null}
          <PixelButton variant={save ? 'default' : 'primary'} size="lg" icon={<PixelIcon name="hammer" size={18} />} onClick={onNew}>
            {save ? '新的远征' : '开始远征'}
          </PixelButton>
          <PixelButton variant="ghost" size="lg" icon={<PixelIcon name="book" size={18} />} onClick={onCredits}>
            制作名单
          </PixelButton>
        </div>

        {save ? (
          <div className="save-summary">
            <div className="save-summary__line">
              <span className="save-summary__pulse" />
              <b>存档已链接</b>
              <span>审判官 {save.inquisitorName}</span>
            </div>
            <div className="save-summary__stats">
              <span>最深生存 <b>{formatDuration(save.endless.bestTime)}</b></span>
              <span>最高击杀 <b>{formatNumber(save.endless.bestKills)}</b></span>
              <span>遗产宝箱 <b>{save.endless.chests}</b></span>
              <span>累计击杀 <b>{formatNumber(save.stats.totalKills)}</b></span>
            </div>
          </div>
        ) : (
          <div className="save-summary save-summary--empty">
            <PixelIcon name="info" size={16} />
            <span>没有找到远征存档。完成首次远征后，舰船会自动记录你的坐标。</span>
          </div>
        )}
      </main>

      <aside className="title-side-note" aria-hidden>
        <span>THOUGHT FOR THE DAY:</span>
        <b>“怀疑是忠诚的阴影。而阴影里藏着异端。”</b>
      </aside>

      <footer className="title-footer">
        <div>
          <span>v{GAME_VERSION}</span>
          <span className="dot">·</span>
          <span>触控 / 键鼠操作</span>
          <span className="dot">·</span>
          <span>本地存档</span>
        </div>
        <div className="title-footer__legal">
          非商业同人项目。Warhammer 40,000 及相关设定归 Games Workshop 所有。本作品不使用官方美术或音频素材。
        </div>
      </footer>
    </div>
  );
}
