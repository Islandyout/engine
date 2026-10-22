-- Localisation: what the HUD shows is looked up in a table before it is drawn. The scripts keep their English strings
-- (they are also the keys items and quests are found by); only display text for a few widgets and the announcements is
-- translated, phrase by phrase, longest phrases first. L switches language in the Player; the other scripts are told.
LANG = save.get("jianghu-road-lang")
if LANG ~= "zh" then LANG = "en" end

local ZH = {
  { "Mirror: E when you are happy with how you look.", "铜镜:满意后按E。" },
  { "Mirror", "铜镜" },
  { "> Robe: ", "> 袍色:" },
  { "> Hair: ", "> 发型:" },
  { "> Cut: ", "> 款式:" },
  { "> Language: ", "> 语言:" },
  { "Scholar's cap", "书生帽" },
  { "Parted", "分发" },
  { "Buns", "双髻" },
  { "Shaven", "光头" },
  { "Long robe", "长袍" },
  { "Tunic", "短衫" },
  { "Crimson", "绯红" },
  { "Azure", "青" },
  { "Jade", "翠" },
  { "Saffron", "藏红" },
  { "Dual cultivation with Lan: x1.8", "与兰双修:x1.8" },
  { "Dual cultivation: your bond with Lan deepens. Insight +1", "双修:你与兰的情谊加深。悟性+1" },
  { "Lead on, senior. Meditate beside me and we will cultivate together.", "前辈请带路。在我身旁打坐,我们便可双修。" },
  { "Welcome, disciple. Qi is the river of the martial world.", "欢迎,弟子。气是武林之河。" },
  { "A good lesson! Keep your guard higher.", "好一课!把守势抬高些。" },
  { "Herbs, a furnace and patience. A good pill is a promise the body keeps.", "药草、丹炉与耐心。一枚好丹,是身体守住的承诺。" },
  { "A scroll holds an art; the rest is practice. What would you like?", "卷轴藏着一门功法,其余靠修习。你想要什么?" },
  { "A good horse covers the valley before the tea cools.", "好马一盏茶的工夫便能跑遍山谷。" },
  { "My cart! Thank you. Take this, it is all I have.", "我的车!多谢。收下这个,这是我仅有的了。" },
  { "Heavenly tribulation! Keep moving and stay out of the red rings.", "天劫降临!保持移动,避开红圈。" },
  { "Qi deviation! The breakthrough failed and part of your qi scatters.", "走火入魔!突破失败,真气四散。" },
  { "You rest. Health and mana restored; you will return here.", "你歇息片刻,气血与真气恢复;你将回到此处。" },
  { "Progress loaded. Pray at a shrine to save again.", "已读取进度。在神龛祈祷即可再次存档。" },
  { "Hold E at a glowing herb to pick it. The furnace brews them into pills.", "对着发光的草药按住E采摘。丹炉可将其炼成丹药。" },
  { "Fill your qi bar, then press B with a Breakthrough Pill.", "充满真气条,再带着破境丹按B。" },
  { "Dense qi in crystal. Used to temper gear and brew rare pills.", "凝于晶中的浓郁灵气,可淬炼装备、炼制珍丹。" },
  { "Only a Foundation cultivator can ride a flying sword.", "唯有筑基修士方可御剑飞行。" },
  { "You can ride the flying sword: press V.", "你可以御剑飞行:按V。" },
  { "Stand still and hold N to meditate.", "站定不动,按住N打坐。" },
  { "Your qi can lean another way, for 100 silver.", "你的真气可另择一途,需100银两。" },
  { "Your qi leans one way. Name it.", "你的真气偏向一途,请择其名。" },
  { "Climb to the shrine and defeat the Iron Fist Elder.", "登上神龛,击败铁拳长老。" },
  { "Speak with the elder inside the sect gate.", "与山门内的长老交谈。" },
  { "Defeat the five bandits in the valley camp.", "击败山谷营地的五名山贼。" },
  { "Find Wen's cart by the old watchtower.", "在旧哨塔旁找到阿文的车。" },
  { "Return to Wen with his cart.", "把车交还阿文。" },
  { "Walk the road and the sect will see it.", "走这条路,宗门自会看见。" },
  { "The guardian's qi blazes. It will not fall easily.", "守护者真气炽盛,不会轻易倒下。" },
  { "The guardian drops a Breakthrough Pill.", "守护者掉落了一枚破境丹。" },
  { "A spirit guardian answers your call.", "一尊灵守护应召而至。" },
  { "The fox trots off to the woods.", "灵狐小跑着回了树林。" },
  { "She will follow you and sniff out herbs.", "她会跟着你,嗅出草药。" },
  { "A spirit stone glints in the carp's mouth.", "鲤鱼口中闪着一枚灵石。" },
  { "Ask the mission board in the Great Hall.", "去大殿的任务榜上看看。" },
  { "You may hold two missions at once.", "你最多可同时接两个任务。" },
  { "Nothing in reach to grapple.", "没有可钩的目标。" },
  { "Your qi ran dry. The sword falls.", "真气耗尽,剑坠落了。" },
  { "Not enough qi to fly.", "真气不足,无法飞行。" },
  { "Heavenly tribulation: keep moving", "天劫:保持移动" },
  { "Heavenly tribulation\nLightning gathers. Keep moving!", "天劫\n雷电汇聚,保持移动!" },
  { "Qi deviation\nThe breakthrough failed and your qi scatters.", "走火入魔\n突破失败,真气四散。" },
  { "Breakthrough!\nYou have entered the ", "突破!\n你已踏入" },
  { "Breakthrough! You are now in the ", "突破!你现在是" },
  { "YOU HAVE FALLEN\nYour qi scatters on the wind.\nRise again", "你已倒下\n真气随风而散。\n重新站起" },
  { "Side quest complete\n60 silver and 2 Qi Elixirs.", "支线完成\n60银两与2瓶真气灵液。" },
  { "Side quest\nFind Wen's cart near the old watchtower.", "支线任务\n在旧哨塔附近找到阿文的车。" },
  { "Side quest\nYou found Wen's cart. Return to him.", "支线任务\n你找到了阿文的车,把它交还给他。" },
  { "Fishing\nA bite! Press E now.", "垂钓\n上钩了!现在按E。" },
  { "Fishing\nIt got away.", "垂钓\n鱼跑了。" },
  { "Fishing\nThe line is out. Wait for a bite.", "垂钓\n鱼线已下,等鱼上钩。" },
  { "Fishing\nYou cannot carry more.", "垂钓\n你带不下更多了。" },
  { "Fishing\nYou reeled in too early.", "垂钓\n你收线太早了。" },
  { "Fishing\nYou step away from the water.", "垂钓\n你离开了水边。" },
  { "You cannot afford that.", "银两不够。" },
  { "You cannot carry more.", "你带不下更多了。" },
  { "You lack the ingredients.", "材料不足。" },
  { "You lack the materials.", "材料不足。" },
  { "You are not ready for it.", "你还没准备好。" },
  { "Your qi is already full.", "你的真气已满。" },
  { "Out of arrows.", "箭已用尽。" },
  { "Well done.", "做得好。" },
  { "Press E: ", "按E:" },
  { "Mission complete\n", "任务完成\n" },
  { "New rank\n", "晋升\n" },
  { "Shrine found\n", "发现神龛\n" },
  { "Art learned\n", "习得功法\n" },
  { "Achievement\n", "成就\n" },
  { "Side quest", "支线任务" },
  { "Quest log", "任务日志" },
  { "Cultivation tree", "修炼树" },
  { "Character sheet", "角色面板" },
  { "Skill tree", "技能树" },
  { "Meridians", "经脉" },
  { "Inventory", "背包" },
  { "Journal", "日志" },
  { "Codex", "典籍" },
  { "Standing", "声望" },
  { "Qi Gathering", "聚气" },
  { "Foundation", "筑基" },
  { "Golden Core", "金丹" },
  { "Mortal", "凡人" },
  { "Early", "初期" },
  { "Middle", "中期" },
  { "Late", "后期" },
  { "Peak", "巅峰" },
  { "Next realm", "下一境界" },
  { "Insight", "悟性" },
  { "Health", "生命" },
  { "Mana", "真气" },
  { "Qi", "气" },
  { "Elder Mu", "穆长老" },
  { "Merchant Lin", "商人林" },
  { "Stablemaster Gu", "马夫古" },
  { "Instructor Hua", "华教习" },
  { "Disciple Lan", "弟子兰" },
  { "Iron Fist Elder", "铁拳长老" },
  { "Willow Village", "柳村" },
  { "Heaven Peak", "天峰" },
  { "Azure Cloud Sect", "青云宗" },
  { "Great Hall", "大殿" },
  { "Cave of Whispers", "低语洞" },
  { "Water Dragon Lake", "水龙湖" },
  { "Wen", "阿文" },
  { "Qi Elixir", "真气灵液" },
  { "Jade Dew Pill", "玉露丹" },
  { "Breakthrough Pill", "破境丹" },
  { "Spirit Herb", "灵草" },
  { "Spirit Stone", "灵石" },
  { "Spirit Fox", "灵狐" },
  { "Iron Ore", "铁矿" },
  { "Silver Carp", "银鲤" },
  { "Fire Talisman", "火符" },
  { "Ward Talisman", "护符" },
  { "Array Flag", "阵旗" },
  { "Dragon Crown", "龙冠" },
  { "Cloud Silk Robe", "云丝袍" },
  { "Azure Robe", "青袍" },
  { "Venison", "鹿肉" },
  { "Silver", "银两" },
  { "Arrows", "箭矢" },
  { "Arrow", "箭" },
  { "Sword Qi", "剑气" },
  { "Thunder Lance", "雷枪" },
  { "Flame Palm", "烈焰掌" },
  { "Sword", "剑" },
  { "Spear", "枪" },
  { "Glaive", "戟" },
  { "Fists", "拳" },
  { "Bow", "弓" },
  { "Poison", "中毒" },
  { "Bleeding", "流血" },
  { "Burning", "灼烧" },
  { "Chilled", "冰寒" },
  { "Cursed", "诅咒" },
  { "Bandit", "山贼" },
  { "Shade", "幽影" },
  { "Wolf", "狼" },
  { "Guardian", "守护者" },
  { "Brawler", "拳手" },
  { "Swordsman", "剑客" },
  { "Spearman", "枪手" },
  { "Qi Adept", "气修" },
  { "Outer Disciple", "外门弟子" },
  { "Inner Disciple", "内门弟子" },
  { "Core Disciple", "核心弟子" },
  { "Farewell.", "再会。" },
  { "Never mind", "算了" },
}
table.sort(ZH, function(a, b) return #a[1] > #b[1] end)

local cache, cached = {}, 0
function tr(s)
  if LANG == "en" or type(s) ~= "string" or s == "" then return s end
  local hit = cache[s]
  if hit then return hit end
  local out = s
  for _, pair in ipairs(ZH) do
    local from, to = pair[1], pair[2]
    local at = out:find(from, 1, true)
    if at then
      local parts, from_at = {}, 1
      while at do
        parts[#parts + 1] = out:sub(from_at, at - 1)
        parts[#parts + 1] = to
        from_at = at + #from
        at = out:find(from, from_at, true)
      end
      parts[#parts + 1] = out:sub(from_at)
      out = table.concat(parts)
    end
  end
  if cached > 400 then cache, cached = {}, 0 end
  cache[s], cached = out, cached + 1
  return out
end

function set_language(code)
  LANG = code == "zh" and "zh" or "en"
  cache, cached = {}, 0
  save.set("jianghu-road-lang", LANG)
end

-- Widgets whose text is words for a reader (not formats the kit parses by name).
local TRANSLATED = { Dialogue = true, Notification = true, Tip = true, ["Qi bar"] = true, ["Character sheet"] = true,
  ["Skill tree"] = true, Meridians = true, ["Quest log"] = true, Status = true }
local raw_text, raw_announce = ui.set_text, hud.announce
ui.set_text = function(name, text) return raw_text(name, TRANSLATED[name] and tr(text) or text) end
hud.announce = function(text, ...) return raw_announce(tr(text), ...) end
