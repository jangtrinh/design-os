// DESIGN:OS 28-Slide Masterclass Internationalization System (i18n)
// Supported languages: English (Default), Tiếng Việt, 한국어, 日本語, Español, Français, 中文
const DECK_I18N = {
  "languages": [
    {
      "code": "en",
      "label": "English (Default)",
      "flag": "🇺🇸"
    },
    {
      "code": "vi",
      "label": "Tiếng Việt",
      "flag": "🇻🇳"
    },
    {
      "code": "ko",
      "label": "한국어",
      "flag": "🇰🇷"
    },
    {
      "code": "ja",
      "label": "日本語",
      "flag": "🇯🇵"
    },
    {
      "code": "es",
      "label": "Español",
      "flag": "🇪🇸"
    },
    {
      "code": "fr",
      "label": "Français",
      "flag": "🇫🇷"
    },
    {
      "code": "zh",
      "label": "中文 (简体)",
      "flag": "🇨🇳"
    }
  ],
  "slides": {
    "1": {
      "en": {
        "eyebrow": "Multi-Runtime Design CLI • Production Operating Manual",
        "title": "Mastering DESIGN:OS<br>From AI Reasoning to Scroll-Cinema &amp; Figma.",
        "subtitle": "7 Strategic Acts: AI vs Kernel Division, 6 Onboarding Roads, Live Figma Bridge 9410, Recall Vector Memory, OKLCH Color Science, 3D GFlow &amp; 2K Scroll-Cinema, and Qualified Delivery Floor.",
        "notes": "Welcome to the DESIGN:OS 28-Slide Complete Masterclass. This manual covers everything from core mathematical foundations, Figma live sync, vector memory, to 3D scroll-cinema flights and Fable thinking."
      },
      "vi": {
        "eyebrow": "Multi-Runtime Design CLI • Cẩm Nang Vận Hành Sản Xuất",
        "title": "Làm chủ Toàn Năng DESIGN:OS<br>Từ AI Reasoning Đến Scroll-Cinema &amp; Figma.",
        "subtitle": "7 Hồi Chiến Lược: Kiến trúc phân quyền AI vs Kernel, 6 Cổng Onboard, Figma Live Bridge 9410, Vòng lặp Học tập Recall, Khoa học màu OKLCH, 3D GFlow &amp; Scroll-Cinema 2K, và Sàn Qualified Delivery.",
        "notes": "Chào mừng đến với DESIGN:OS Masterclass 28 slide. Bộ cẩm nang bao quát từ lõi toán học, cầu nối Figma, bộ nhớ vector đến điện ảnh cuộn trang 3D và 5 câu chuyện ngụ ngôn triết lý thiết kế."
      },
      "ko": {
        "eyebrow": "멀티 런타임 디자인 CLI • 프로덕션 운영 매뉴얼",
        "title": "DESIGN:OS 마스터하기<br>AI 추론부터 스크롤 시네마 &amp; Figma까지.",
        "subtitle": "7개 전략적 장: AI와 커널 분권 구조, 6개 온보딩 경로, 피그마 브릿지 9410, 벡터 메모리 리콜, OKLCH 색채 과학, 3D GFlow 및 2K 스크롤 시네마, 품질 보증 납품 기준.",
        "notes": "DESIGN:OS 28개 슬라이드 마스터클래스에 오신 것을 환영합니다. 핵심 수학 기초부터 피그마 실시간 연동, 벡터 메모리, 3D 스크롤 시네마까지 완벽하게 다룹니다."
      },
      "ja": {
        "eyebrow": "マルチランタイム デザインCLI • 本番運用マニュアル",
        "title": "DESIGN:OS を完全マスター<br>AI推論からスクロールシネマ＆Figmaまで.",
        "subtitle": "7つの戦略的幕: AI対カーネル分権構造、6つのオンボーディング経路、Figmaブリッジ9410、ベクトルメモリRecall、OKLCH色彩科学、3D GFlow＆2Kスクロールシネマ、品質保証デリバリー基準。",
        "notes": "DESIGN:OS 28スライド マスタークラスへようこそ。数学的基礎からFigmaリアルタイム連携、ベクトルメモリ、3Dスクロールシネマまで網羅しています。"
      },
      "es": {
        "eyebrow": "CLI de Diseño Multi-Runtime • Manual de Operación en Producción",
        "title": "Dominando DESIGN:OS<br>Desde el Razonamiento AI hasta Scroll-Cinema y Figma.",
        "subtitle": "7 Actos Estratégicos: División AI vs Kernel, 6 Vías de Onboarding, Figma Live Bridge 9410, Memoria Vectorial Recall, Ciencia del Color OKLCH, GFlow 3D y Scroll-Cinema 2K, y Entrega Calificada.",
        "notes": "Bienvenidos a la Masterclass Completa de DESIGN:OS en 28 Diapositivas. Abarca desde fundamentos matemáticos hasta sincronización con Figma, memoria vectorial y vuelos 3D."
      },
      "fr": {
        "eyebrow": "CLI de Design Multi-Runtime • Manuel d'Exploitation Production",
        "title": "Maîtriser DESIGN:OS<br>Du Raisonnement IA au Scroll-Cinéma &amp; Figma.",
        "subtitle": "7 Actes Stratégiques: Séparation IA vs Noyau, 6 Voies d'Intégration, Pont Figma 9410, Mémoire Vectorielle Recall, Science des Couleurs OKLCH, GFlow 3D &amp; Scroll-Cinéma 2K, et Livraison Qualifiée.",
        "notes": "Bienvenue dans la Masterclass DESIGN:OS en 28 diapositives. Ce guide couvre des fondations mathématiques à la synchronisation Figma en direct, la mémoire vectorielle et le cinéma 3D."
      },
      "zh": {
        "eyebrow": "多运行时设计CLI • 生产级系统操作手册",
        "title": "全面掌握 DESIGN:OS<br>从 AI 推理到滚动电影与 Figma 实时画布.",
        "subtitle": "7大核心篇章: AI与确定性内核分权架构、6大Onboarding入口、Figma桌面桥接9410、Recall向量记忆、OKLCH色彩科学、3D GFlow与2K滚动电影、Qualified Delivery交付底线。",
        "notes": "欢迎来到 DESIGN:OS 28页大师课。涵盖从底层色彩数学、Figma实时桥接、向量记忆、到3D空间镜头控制与Design Fables哲学的全部核心体系。"
      }
    },
    "2": {
      "en": {
        "eyebrow": "Core Philosophy",
        "title": "The 3 Supreme Truths of DESIGN:OS",
        "subtitle": "Eliminating reliance on LLM luck. Enforcing quality through color science and deterministic machine floors.",
        "notes": "The 3 core truths form our compass: converting stochastic LLM chaos into reliable, deterministic code."
      },
      "vi": {
        "eyebrow": "Triết Lý Cốt Lõi",
        "title": "3 Chân Lý Tối Thượng Của DESIGN:OS",
        "subtitle": "Không dựa vào sự may rủi của mô hình LLM. Ép chất lượng bằng toán học màu sắc và sàn kiểm định tất định.",
        "notes": "3 chân lý tối thượng là kim chỉ nam: biến sự hỗn loạn của LLM thành kết quả tất định."
      },
      "ko": {
        "eyebrow": "핵심 원칙",
        "title": "DESIGN:OS의 3대 핵심 공리",
        "subtitle": "LLM의 운에 의존하지 않고, 색채 과학과 결정론적 검증 바닥을 통해 품질을 강제합니다.",
        "notes": "3대 핵심 공리는 LLM의 무작위성을 결정론적 결과물로 전환하는 기준입니다."
      },
      "ja": {
        "eyebrow": "コア哲学",
        "title": "DESIGN:OS 3つの至高の真理",
        "subtitle": "LLMの偶然性に頼らず、色彩科学と決定論的検証フロアによって品質を担保します。",
        "notes": "3つの至高の真理は、LLMの不確実性を決定論的なコードへと変換するための羅針盤です。"
      },
      "es": {
        "eyebrow": "Fundamentos Clave",
        "title": "Las 3 Verdades Supremas de DESIGN:OS",
        "subtitle": "Eliminando la suerte de los LLM. Garantizando calidad mediante ciencia del color y pisos deterministas.",
        "notes": "Las 3 verdades supremas convierten el caos estocástico en código confiable y determinista."
      },
      "fr": {
        "eyebrow": "Fondations Essentielles",
        "title": "Les 3 Vérités Suprêmes de DESIGN:OS",
        "subtitle": "Éliminer l'aléatoire des LLM. Forcer la qualité par la science des couleurs et des contrôles déterministes.",
        "notes": "Ces 3 vérités transforment le chaos stochastique en code déterministe et fiable."
      },
      "zh": {
        "eyebrow": "核心设计公理",
        "title": "DESIGN:OS 的三大至高公理",
        "subtitle": "告别对大模型运气的依赖，通过严密色彩数学与确定性机器底线死守品质。",
        "notes": "三大公理是核心指南针：将大模型的随机混乱转化为确定性的工业级代码。"
      }
    },
    "3": {
      "en": {
        "eyebrow": "Architecture Split",
        "title": "Division of Labor: AI Reasoning vs UI Kernel",
        "subtitle": "Host AI Agent handles creative reasoning, while the deterministic UI Kernel handles color mathematics, tokens compilation, and lint enforcement.",
        "notes": "AI agents reason and generate; UI Kernel verifies and enforces. Together they create an error-free self-repairing loop."
      },
      "vi": {
        "eyebrow": "Kiến Trúc Phân Quyền",
        "title": "Sơ Đồ Phân Quyền: AI Reasoning vs UI Kernel",
        "subtitle": "Host AI Agent đóng vai trò sáng tạo (Reasoning), trong khi UI Kernel làm nhiệm vụ tính toán toán học và kiểm tra tuân thủ (Verification).",
        "notes": "AI Agent suy luận, UI Kernel kiểm định. Hai bán cầu kết hợp thành vòng lặp tự sửa lỗi hoàn hảo."
      },
      "ko": {
        "eyebrow": "역할 분권 아키텍처",
        "title": "분권 구조: AI 추론 vs UI 커널",
        "subtitle": "호스트 AI 에이전트는 창의적 추론을 담당하고, 결정론적 UI 커널은 색채 수학, 토큰 컴파일 및 린트 검증을 수행합니다.",
        "notes": "AI 에이전트의 추론과 UI 커널의 결정론적 검증이 결합되어 완벽한 자동 복구 루프를 형성합니다."
      },
      "ja": {
        "eyebrow": "分権アーキテクチャ",
        "title": "役割分担: AI推論 vs UIカーネル",
        "subtitle": "ホストAIエージェントが創造的推論を担い、決定論的UIカーネルが色彩数学、トークン変換、Lint検証を実行します。",
        "notes": "AIの柔軟な推論とカーネルの厳格な検証が組み合わさり、自動修復ループを実現します。"
      },
      "es": {
        "eyebrow": "División de Arquitectura",
        "title": "División de Trabajo: Razonamiento AI vs UI Kernel",
        "subtitle": "El agente AI maneja el razonamiento creativo, mientras que el Kernel UI ejecuta las matemáticas de color y las verificaciones.",
        "notes": "El agente AI razona y el Kernel UI verifica, creando un bucle perfecto de auto-reparación."
      },
      "fr": {
        "eyebrow": "Séparation d'Architecture",
        "title": "Division du Travail: Raisonnement IA vs Noyau UI",
        "subtitle": "L'agent IA gère le raisonnement créatif, tandis que le Noyau UI déterministe assure les calculs mathématiques et la conformité.",
        "notes": "L'IA raisonne et le Noyau vérifie, créant une boucle d'auto-correction robuste."
      },
      "zh": {
        "eyebrow": "分权架构设计",
        "title": "分权体系: AI 空间推理 vs UI 确定性内核",
        "subtitle": "Host AI Agent 负责美学推演与结构生成，UI Kernel 负责 OKLCH 色彩数学计算、Token 编译与 14 大机器红线裁决。",
        "notes": "AI 大脑负责发散推理，UI 机器内核负责确定性判决，构成闭环的自愈修复系统。"
      }
    },
    "4": {
      "en": {
        "eyebrow": "Specialized Modules",
        "title": "The 6 Specialized Optional Hands Ecosystem",
        "subtitle": "Specialized modular hands extend multi-dimensional design capabilities, gracefully degrading when unconfigured.",
        "notes": "These 6 optional hands transform DESIGN:OS into a complete design operating system from flat web to 3D and Figma."
      },
      "vi": {
        "eyebrow": "Module Mở Rộng",
        "title": "Hệ Sinh Thái 6 \"Cánh Tay\" Chuyên Trách (Optional Hands)",
        "subtitle": "Các module chuyên trách mở rộng năng lực thiết kế đa chiều, tự suy giảm nhẹ nhàng khi vắng mặt (Graceful Degradation).",
        "notes": "6 cánh tay này biến DESIGN:OS thành hệ điều hành thiết kế toàn năng từ giao diện web phẳng đến không gian 3D và canvas Figma."
      },
      "ko": {
        "eyebrow": "특화 모듈",
        "title": "6대 전문 옵셔널 핸즈(Optional Hands) 생태계",
        "subtitle": "다차원 디자인 역량을 확장하며, 모듈 부재 시 우아한 기능 저하(Graceful Degradation)를 제공합니다.",
        "notes": "이 6개의 핸즈는 DESIGN:OS를 평면 웹부터 3D, 피그마 캔버스까지 아우르는 완벽한 OS로 만듭니다."
      },
      "ja": {
        "eyebrow": "専門モジュール",
        "title": "6つの特化型オプショナル・ハンズ（Optional Hands）エコシステム",
        "subtitle": "多次元のデザイン能力を拡張し、未設定時も安全にフォールバック（Graceful Degradation）します。",
        "notes": "これら6つの拡張機能により、Webから3D、Figmaまで統一されたデザイン体験を提供します。"
      },
      "es": {
        "eyebrow": "Módulos Especializados",
        "title": "Ecosistema de 6 Manos Opcionales Especializadas",
        "subtitle": "Módulos que expanden capacidades de diseño multidimensional, degradándose suavemente si no están presentes.",
        "notes": "Estas 6 manos transforman a DESIGN:OS en un sistema operativo de diseño completo."
      },
      "fr": {
        "eyebrow": "Modules Spécialisés",
        "title": "L'Écosystème des 6 Mains Optionnelles Spécialisées",
        "subtitle": "Des modules qui étendent les capacités de design multidimensionnel avec une dégradation élégante en cas d'absence.",
        "notes": "Ces 6 modules font de DESIGN:OS un véritable système d'exploitation de design global."
      },
      "zh": {
        "eyebrow": "扩展手柄体系",
        "title": "6 大专业特化手柄生态 (Optional Hands)",
        "subtitle": "高内聚的专业功能模块，拓展从矢量画布到 3D 电影的全部能力，缺失时自动优雅降级。",
        "notes": "这 6 大专业手柄将 DESIGN:OS 从简单的代码生成器升维为全场景设计操作系统。"
      }
    },
    "5": {
      "en": {
        "eyebrow": "Design Identity",
        "title": "3-Tier Design Soul Hierarchy (Never / Always / Voice)",
        "subtitle": "Establishing aesthetic stances and consistent design vocabulary from Studio level down to specific projects.",
        "notes": "Design Soul defines aesthetic identity. The user's explicit brief always holds the highest precedence."
      },
      "vi": {
        "eyebrow": "Bản Sắc Thiết Kế",
        "title": "Hệ Thống 3 Tầng Design Soul (Never / Always / Voice)",
        "subtitle": "Định hình lập trường thẩm mỹ và ngôn ngữ thiết kế nhất quán từ cấp Studio đến từng dự án cụ thể.",
        "notes": "Soul thiết lập lập trường thẩm mỹ. Explicit Brief từ user luôn có quyền ghi đè cao nhất."
      },
      "ko": {
        "eyebrow": "디자인 아이덴티티",
        "title": "3계층 디자인 소울(Design Soul) 아키텍처",
        "subtitle": "스튜디오 레벨부터 개별 프로젝트까지 일관된 미학적 입장과 디자인 어휘를 수립합니다.",
        "notes": "디자인 소울은 미학적 기준을 세우며, 사용자의 명시적 지시가 항상 최우선 순위를 갖습니다."
      },
      "ja": {
        "eyebrow": "デザイン・アイデンティティ",
        "title": "3層のデザインソウル（Design Soul）構造",
        "subtitle": "スタジオ全体から個別プロジェクトに至るまで、一貫した美学方針と語彙を定義します。",
        "notes": "ソウルは美学の規範を定義します。ユーザーの明示的な要求が常に最優先されます。"
      },
      "es": {
        "eyebrow": "Identidad de Diseño",
        "title": "Jerarquía de 3 Niveles de Design Soul",
        "subtitle": "Establece posturas estéticas y vocabulario consistente desde el estudio hasta proyectos individuales.",
        "notes": "Soul define la postura estética. Las instrucciones explícitas del usuario siempre tienen máxima prioridad."
      },
      "fr": {
        "eyebrow": "Identité Visuelle",
        "title": "Hiérarchie à 3 Niveaux du Design Soul",
        "subtitle": "Établit les partis pris esthétiques et le vocabulaire de design du studio jusqu'au projet.",
        "notes": "Le Soul définit l'identité visuelle. Les directives explicites priment toujours."
      },
      "zh": {
        "eyebrow": "设计美学灵魂",
        "title": "3 级 Design Soul 美学灵魂体系",
        "subtitle": "通过 Never / Always / Voice 规则建立从工作室全局到具体项目的统一美学立场。",
        "notes": "Soul 定义团队的美学红线与设计语调，用户的 Explicit Brief 永远拥有最高覆盖权。"
      }
    },
    "6": {
      "en": {
        "eyebrow": "Onboarding Matrix",
        "title": "6 Entry Roads for Project Onboarding (E1–E6)",
        "subtitle": "Seamlessly onboarding any project state: from zero codebase, existing repos, reference URLs, to Figma frames.",
        "notes": "E1 to E6 provide deterministic routes for every project starting state."
      },
      "vi": {
        "eyebrow": "Ma Trận Tiếp Nhận",
        "title": "Router 6 Cổng Vào Onboarding (E1–E6)",
        "subtitle": "Tiếp nhận mọi hiện trạng dự án: từ con số 0, codebase có sẵn, URL tham chiếu, đến file Figma thực tế.",
        "notes": "E1 đến E6 mở đường cho mọi trạng thái dự án bắt đầu với DESIGN:OS một cách tất định."
      },
      "ko": {
        "eyebrow": "온보딩 라우터",
        "title": "프로젝트 온보딩을 위한 6가지 진입 경로 (E1–E6)",
        "subtitle": "완전한 제로 베이스, 기존 코드베이스, 참조 URL, 피그마 프레임까지 모든 프로젝트 상태를 원활하게 수용합니다.",
        "notes": "E1부터 E6까지의 경로는 프로젝트의 시작 상태에 맞춰 최적의 온보딩 워크플로우를 제공합니다."
      },
      "ja": {
        "eyebrow": "オンボーディング・ルーター",
        "title": "プロジェクト受入の6つの進入路 (E1–E6)",
        "subtitle": "新規プロジェクト、既存コード、参照URL、Figmaフレームまで、あらゆる状態から即座に導入可能です。",
        "notes": "E1からE6のルートにより、どのような初期状態のプロジェクトでも決定論的に統合できます。"
      },
      "es": {
        "eyebrow": "Matriz de Incorporación",
        "title": "6 Vías de Entrada para Onboarding (E1–E6)",
        "subtitle": "Integración fluida para cualquier estado: proyectos nuevos, código existente, URLs o Figma.",
        "notes": "E1 a E6 proporcionan rutas deterministas para cada estado inicial."
      },
      "fr": {
        "eyebrow": "Matrice d'Intégration",
        "title": "6 Voies d'Entrée pour l'Intégration (E1–E6)",
        "subtitle": "Intégration sans couture pour tout projet: nouveau, existant, URL de référence ou Figma.",
        "notes": "E1 à E6 assurent une transition fluide quel que soit le point de départ."
      },
      "zh": {
        "eyebrow": "Onboarding 路由体系",
        "title": "6 大项目接入路由通道 (E1–E6)",
        "subtitle": "无缝适配从零冷启动、已有工程改建、线上站点逆向、到 Figma 实时画板等任意初始状态。",
        "notes": "E1 至 E6 构筑了覆盖全场景的精准接入流水线。"
      }
    },
    "7": {
      "en": {
        "eyebrow": "Workflow Discipline",
        "title": "5-Step Setup Protocol &amp; Mandatory STOP-Gates",
        "subtitle": "Strict discipline: never generate UI code without passing the prerequisite configuration gates.",
        "notes": "STOP-Gates prevent premature code generation before tokens and design soul are compiled."
      },
      "vi": {
        "eyebrow": "Kỷ Luật Quy Trình",
        "title": "Quy Trình 5 Bước &amp; Các STOP-Gates Bắt Buộc",
        "subtitle": "Kỷ luật thép: không bao giờ sinh mã HTML/CSS khi chưa vượt qua các cổng kiểm tra cấu hình tiên quyết.",
        "notes": "STOP-Gates ngăn chặn tình trạng sinh mã vô tội vạ khi chưa có token và design soul."
      },
      "ko": {
        "eyebrow": "워크플로우 규율",
        "title": "5단계 셋업 프로토콜 및 필수 STOP-Gates",
        "subtitle": "철저한 규율: 선행 구성 게이트를 통과하기 전에는 절대 UI 코드를 생성하지 않습니다.",
        "notes": "STOP-Gates는 토큰과 디자인 소울이 컴파일되기 전 불완전한 코드 생성을 엄격히 차단합니다."
      },
      "ja": {
        "eyebrow": "ワークフロー規律",
        "title": "5段階セットアップ手順と必須 STOP-Gates",
        "subtitle": "厳格な規律: 前提となる構成ゲートを通過するまで、UIコードの生成を行ってはなりません。",
        "notes": "STOP-Gatesはトークンやデザインソウルが準備される前の早まったコード生成を防止します。"
      },
      "es": {
        "eyebrow": "Disciplina de Trabajo",
        "title": "Protocolo de 5 Pasos y STOP-Gates Obligatorios",
        "subtitle": "Disciplina estricta: nunca generar código UI sin superar las puertas de configuración previas.",
        "notes": "Los STOP-Gates evitan la generación prematura de código sin tokens validados."
      },
      "fr": {
        "eyebrow": "Discipline de Flux",
        "title": "Protocole en 5 Étapes &amp; STOP-Gates Obligatoires",
        "subtitle": "Discipline stricte: ne jamais générer de code UI sans valider les étapes de configuration préalables.",
        "notes": "Les STOP-Gates empêchent toute génération de code avant la validation des tokens."
      },
      "zh": {
        "eyebrow": "初始化铁律",
        "title": "5 步初始化规程与强制 STOP-Gates 红线",
        "subtitle": "绝对纪律：在未完成环境诊断、Token 编译与 Soul 声明前，严禁越级直接生成 UI 代码。",
        "notes": "STOP-Gates 坚决杜绝在缺少设计地基时的盲目瞎写。"
      }
    },
    "8": {
      "en": {
        "eyebrow": "Autonomous Collaboration",
        "title": "Virtual Design Staff &amp; Periodic Heartbeat",
        "subtitle": "Self-coordinating virtual agent team executing continuous tasks through the deterministic heartbeat daemon.",
        "notes": "Designer, Curator, and Figma Hand work together under heartbeat supervision."
      },
      "vi": {
        "eyebrow": "Cộng Tác Tự Trị",
        "title": "Đội Ngũ Subagents Ảo &amp; Heartbeat Định Kỳ",
        "subtitle": "Bộ 3 nhân sự ảo tự phối hợp, chạy các tác vụ định kỳ qua cơ chế Heartbeat độc lập.",
        "notes": "Designer, Curator, và Figma Hand phối hợp nhịp nhàng dưới sự điều phối của Heartbeat."
      },
      "ko": {
        "eyebrow": "자율 협업 팀",
        "title": "가상 디자인 스태프 및 주기적 하트비트(Heartbeat)",
        "subtitle": "결정론적 하트비트 데몬을 통해 지속적인 유지보수 작업을 수행하는 자율 협업 가상 에이전트 팀.",
        "notes": "디자이너, 큐레이터, 피그마 핸드가 하트비트 감시 하에 완벽한 분업을 이룹니다."
      },
      "ja": {
        "eyebrow": "自律協調スタッフ",
        "title": "仮想デザインチームと周期的ハートビート",
        "subtitle": "決定論的ハートビートデーモンにより継続的なタスクを実行する自律型仮想エージェントチーム。",
        "notes": "Designer、Curator、Figma Handがハートビート管理下で有機的に連携します。"
      },
      "es": {
        "eyebrow": "Colaboración Autónoma",
        "title": "Equipo de Diseño Virtual y Heartbeat Periódico",
        "subtitle": "Equipo de agentes virtuales autónomos que ejecutan tareas continuas mediante el demonio de heartbeat.",
        "notes": "Designer, Curator y Figma Hand colaboran bajo la supervisión de Heartbeat."
      },
      "fr": {
        "eyebrow": "Collaboration Autonome",
        "title": "Équipe de Design Virtuelle &amp; Heartbeat Périodique",
        "subtitle": "Équipe d'agents virtuels autonomes exécutant des tâches continues via le démon heartbeat déterministe.",
        "notes": "Le Designer, le Curateur et Figma Hand collaborent sous la régulation du heartbeat."
      },
      "zh": {
        "eyebrow": "自主协同体系",
        "title": "虚拟设计班组与周期性 Heartbeat 心跳守护",
        "subtitle": "Designer、Curator 与 Figma Hand 虚拟专员协同作业，通过确定性心跳守护实现无人值守维护。",
        "notes": "三大虚拟角色各司其职，在 Heartbeat 的精确节拍下完成资产巡检与自动优化。"
      }
    },
    "9": {
      "en": {
        "eyebrow": "Daily Operations",
        "title": "The 6 Core Daily Verbs (/ui:* Commands)",
        "subtitle": "Standardized slash commands covering every day-to-day design requirement with absolute determinism.",
        "notes": "From generate to iterate and to-figma, these 6 verbs structure every agent workflow."
      },
      "vi": {
        "eyebrow": "Thao Tác Thường Nhật",
        "title": "6 Động Từ Thường Nhật (Daily Verbs)",
        "subtitle": "Bộ lệnh slash command chuẩn hóa đáp ứng mọi nhu cầu thiết kế hàng ngày với độ tất định tuyệt đối.",
        "notes": "Từ generate đến iterate và to-figma, 6 động từ này định hình toàn bộ luồng làm việc của agent."
      },
      "ko": {
        "eyebrow": "일일 운영 커맨드",
        "title": "6대 일상 동사 커맨드 (Daily Verbs)",
        "subtitle": "절대적인 결정론을 기반으로 매일의 디자인 요구사항을 완벽히 충족하는 표준 슬래시 명령어 세트.",
        "notes": "생성부터 반복 개선, 피그마 전송까지 6개 명령어가 모든 워크플로우를 주도합니다."
      },
      "ja": {
        "eyebrow": "日常オペレーション",
        "title": "6つの日常コマンド（Daily Verbs）",
        "subtitle": "決定論的な品質を維持しながら、日々のデザイン作業を網羅する標準スラッシュコマンド群。",
        "notes": "generateからiterate、to-figmaまで、6つのコマンドがエージェントの作業を定義します。"
      },
      "es": {
        "eyebrow": "Operaciones Diarias",
        "title": "Los 6 Verbos Clave de Operación Diaria",
        "subtitle": "Comandos slash estandarizados que cubren cada necesidad de diseño con total determinismo.",
        "notes": "Desde generate hasta iterate y to-figma, estos 6 verbos estructuran todo el flujo de trabajo."
      },
      "fr": {
        "eyebrow": "Opérations Quotidiennes",
        "title": "Les 6 Verbes Quotidiens Essentiels",
        "subtitle": "Commandes slash standardisées couvrant tous les besoins de conception avec un déterminisme absolu.",
        "notes": "De generate à iterate et to-figma, ces 6 verbes structurent le travail des agents."
      },
      "zh": {
        "eyebrow": "日常操作动词",
        "title": "6 大日常核心设计动词 (/ui:* 指令集)",
        "subtitle": "标准化的斜杠指令集，以高度确定性的协议覆盖从草图生成、局部迭代到画布推送的全部场景。",
        "notes": "6 大日常指令是驱动 DESIGN:OS 运转的核心交互接口。"
      }
    },
    "10": {
      "en": {
        "eyebrow": "Bi-directional Bridge",
        "title": "Figma Desktop Bridge: Broker Port 9410",
        "subtitle": "AI Agents and Designers collaborate on a real-time Figma file with secure conflict locking.",
        "notes": "The local broker on port 9410 connects directly to the Figma Desktop plugin for live layout synthesis and token binding."
      },
      "vi": {
        "eyebrow": "Cầu Nối Hai Chiều",
        "title": "Cây Cầu Figma Desktop: Broker Port 9410",
        "subtitle": "AI Agent và Designer cùng làm việc trên một file Figma thời gian thực với cơ chế khóa xung đột an toàn.",
        "notes": "Broker port 9410 kết nối trực tiếp với Figma Desktop Plugin, cho phép AI dựng layout và gán token tự động."
      },
      "ko": {
        "eyebrow": "양방향 실시간 브릿지",
        "title": "피그마 데스크톱 브릿지: 브로커 포트 9410",
        "subtitle": "AI 에이전트와 디자이너가 안전한 충돌 방지 락을 통해 실시간 피그마 파일에서 협업합니다.",
        "notes": "포트 9410 브로커를 통해 피그마 플러그인과 연결하여 오토레이아웃과 토큰을 실시간 동기화합니다."
      },
      "ja": {
        "eyebrow": "双方向ブリッジ",
        "title": "Figma デスクトップブリッジ: Broker Port 9410",
        "subtitle": "AIエージェントとデザイナーが衝突防止ロック付きでリアルタイムにFigmaファイルを共同編集します。",
        "notes": "ポート9410のローカルブローカーを介して、Figmaプラグインとトークンを双方向同期します。"
      },
      "es": {
        "eyebrow": "Puente Bidireccional",
        "title": "Puente Figma Desktop: Broker Port 9410",
        "subtitle": "Los agentes AI y diseñadores colaboran en tiempo real en Figma con bloqueo de conflictos.",
        "notes": "El broker en el puerto 9410 permite la síntesis de layouts y la vinculación de tokens en vivo."
      },
      "fr": {
        "eyebrow": "Pont Bidirectionnel",
        "title": "Pont Figma Desktop: Broker Port 9410",
        "subtitle": "Les agents IA et les designers collaborent en temps réel sur Figma avec verrouillage sécurisé.",
        "notes": "Le broker sur le port 9410 connecte directement le plugin Figma pour la synchronisation des tokens."
      },
      "zh": {
        "eyebrow": "双向实时桥接",
        "title": "Figma 桌面级桥接体系: Broker 端口 9410",
        "subtitle": "AI Agent 与设计师在 Figma 画布上实时协同，具备安全无锁的冲突避让与断线保护机制。",
        "notes": "9410 端口本地 Broker 直连官方 Plugin，实现代码 Tokens 与 Figma Variables 的 1:1 双向映射。"
      }
    },
    "16": {
      "en": {
        "eyebrow": "Color Science",
        "title": "OKLCH Mathematics, P3 Gamut &amp; Delta EOK",
        "subtitle": "Why DESIGN:OS deprecates legacy HSL/Hex in favor of the perceptually uniform OKLCH color space.",
        "notes": "OKLCH ensures uniform perceived lightness across all hues, guaranteeing true accessibility."
      },
      "vi": {
        "eyebrow": "Khoa Học Màu Sắc",
        "title": "Toán Học Màu OKLCH, Gamut P3 &amp; Delta EOK",
        "subtitle": "Tại sao DESIGN:OS cấm hoàn toàn HSL và sRGB cổ điển để chuyển sang không gian cảm nhận đồng đều OKLCH.",
        "notes": "Toán học màu OKLCH bảo đảm mọi thang bậc sáng đều có cùng độ tương phản mắt thấy."
      },
      "ko": {
        "eyebrow": "색채 과학",
        "title": "OKLCH 수학, P3 색역 및 델타 EOK",
        "subtitle": "DESIGN:OS가 기존 HSL/Hex를 완전히 배제하고 지각적 균일 공간인 OKLCH를 선택한 이유입니다.",
        "notes": "OKLCH는 모든 색상에서 인간의 눈이 느끼는 균일한 밝기를 제공하여 완벽한 웹 접근성을 보장합니다."
      },
      "ja": {
        "eyebrow": "色彩科学",
        "title": "OKLCH 色彩数学、P3色域、Delta EOK",
        "subtitle": "従来のHSLやHexを廃止し、知覚的に均一なOKLCH色空間を採用する理由を解説します。",
        "notes": "OKLCH数学により、あらゆる色相で視覚的に均一な明度とコントラスト比を保証します。"
      },
      "es": {
        "eyebrow": "Ciencia del Color",
        "title": "Matemáticas OKLCH, Gama P3 y Delta EOK",
        "subtitle": "Por qué DESIGN:OS abandona HSL/Hex en favor del espacio perceptualmente uniforme OKLCH.",
        "notes": "OKLCH garantiza una luminosidad percibida uniforme, asegurando verdadera accesibilidad."
      },
      "fr": {
        "eyebrow": "Science des Couleurs",
        "title": "Mathématiques OKLCH, Espace P3 &amp; Delta EOK",
        "subtitle": "Pourquoi DESIGN:OS abandonne HSL/Hex au profit de l'espace perceptuellement uniforme OKLCH.",
        "notes": "OKLCH assure une luminosité perçue constante sur toutes les teintes pour une accessibilité parfaite."
      },
      "zh": {
        "eyebrow": "色彩科学与数学",
        "title": "OKLCH 感知均匀色彩空间、P3 广色域与 ΔEOK",
        "subtitle": "揭秘为何 DESIGN:OS 全面废黜传统 HSL/RGB，转向视觉感知一致的现代 OKLCH 色彩体系。",
        "notes": "OKLCH 严格保证感知亮度 L 的物理一致性，结合 ΔEOK 实现 Semver 破坏性颜色变更的自动判定。"
      }
    },
    "21": {
      "en": {
        "eyebrow": "Scroll-Driven Cinema",
        "title": "Scroll-Cinema: The Art of Seamless Camera Flight",
        "subtitle": "Chaining separately rendered video clips into a single continuous take driven directly by scroll gestures.",
        "notes": "The seam is the product: position and velocity continuity must hold perfectly so the flight feels like one unbroken take."
      },
      "vi": {
        "eyebrow": "Điện Ảnh Cuộn Trang",
        "title": "Scroll-Cinema: Nghệ Thuật Cuộn Phim Không Vết Cắt",
        "subtitle": "Kỹ thuật ráp nối các đoạn clip riêng lẻ thành một cú máy one-take duy nhất điều khiển trực tiếp bằng ngón tay cuộn chuột.",
        "notes": "Mối nối (Seam) là sản phẩm: đảm bảo tính liên tục về vị trí và vận tốc để người xem cảm nhận như 1 cú máy one-take duy nhất."
      },
      "ko": {
        "eyebrow": "스크롤 시네마",
        "title": "스크롤 시네마: 이음새 없는 카메라 비행의 미학",
        "subtitle": "개별 렌더링된 클립들을 스크롤 제스처로 직접 제어하는 하나의 연속적인 원테이크로 결합합니다.",
        "notes": "이음새(Seam)가 곧 제품입니다. 위치와 속도의 연속성이 유지되어야 단절 없는 비행 경험이 완성됩니다."
      },
      "ja": {
        "eyebrow": "スクロール・シネマ",
        "title": "スクロールシネマ: 継ぎ目のないカメラ飛行の美学",
        "subtitle": "個別にレンダリングされた映像を、スクロール操作で操る1つの連続ワンテイクへと結合します。",
        "notes": "シーム（継ぎ目）こそが品質の核心です。位置と速度の連続性を厳格に保持します。"
      },
      "es": {
        "eyebrow": "Cine Guiado por Scroll",
        "title": "Scroll-Cinema: El Arte del Vuelo de Cámara Continuo",
        "subtitle": "Uniendo clips independientes en una toma continua impulsada directamente por el desplazamiento.",
        "notes": "La costura es el producto: la continuidad de posición y velocidad debe mantenerse intacta."
      },
      "fr": {
        "eyebrow": "Cinéma au Défilement",
        "title": "Scroll-Cinéma: L'Art du Vol de Caméra Continu",
        "subtitle": "Assembler des clips distincts en un plan-séquence unique contrôlé par le défilement.",
        "notes": "La jointure est le produit: la continuité de position et de vitesse doit être absolue."
      },
      "zh": {
        "eyebrow": "滚动电影工程",
        "title": "Scroll-Cinema: 无缝一镜到底的滚动电影艺术",
        "subtitle": "通过接缝物理定律（Seam Physics），将多段 AI 生成的视频切片拼接为单手指掌控的超高清一镜到底体验。",
        "notes": "接缝即产品：严格遵循位置连续性与速度矢量锁定，绝不允许在接缝处产生任何倒车眩晕卡顿。"
      }
    },
    "27": {
      "en": {
        "eyebrow": "Fable Thinking",
        "title": "The 5 Design Fables: Philosophy Behind Master Craft",
        "subtitle": "Distilling complex engineering mechanisms into intuitive allegorical archetypes.",
        "notes": "These 5 fables embody the deep design engineering philosophy behind DESIGN:OS."
      },
      "vi": {
        "eyebrow": "Tư Duy Ngụ Ngôn",
        "title": "5 Ngụ Ngôn Triết Lý Thiết Kế (Design Fables)",
        "subtitle": "Đúc kết những cơ chế kỹ thuật phức tạp thành các hình tượng ngụ ngôn trực quan dễ ghi nhớ.",
        "notes": "5 câu chuyện ngụ ngôn là tổng kết triết lý sâu sắc nhất đằng sau toàn bộ công nghệ của DESIGN:OS."
      },
      "ko": {
        "eyebrow": "우화적 사고 모델",
        "title": "5가지 디자인 우화: 마스터 크래프트 뒤에 숨겨진 철학",
        "subtitle": "복잡한 엔지니어링 메커니즘을 직관적인 우화적 아키타입으로 압축하여 전달합니다.",
        "notes": "이 5가지 우화는 DESIGN:OS 기술 전반에 흐르는 깊은 디자인 철학을 상징합니다."
      },
      "ja": {
        "eyebrow": "寓話的思考法",
        "title": "5つのデザイン寓話: 卓越したクラフトを支える哲学",
        "subtitle": "複雑なエンジニアリング構造を、記憶に残りやすい直感的な寓話モデルへと昇華します。",
        "notes": "これら5つの寓話は、DESIGN:OSの設計思想の真髄を端的に物語っています。"
      },
      "es": {
        "eyebrow": "Pensamiento de Fábulas",
        "title": "Las 5 Fábulas de Diseño: Filosofía Detrás del Diseño Maestro",
        "subtitle": "Sintetizando mecanismos complejos en arquetipos alegóricos memorables.",
        "notes": "Estas 5 fábulas representan la filosofía fundamental de ingeniería de DESIGN:OS."
      },
      "fr": {
        "eyebrow": "Pensée par Fables",
        "title": "Les 5 Fables de Design: La Philosophie du Grand Design",
        "subtitle": "Transformer des mécanismes complexes en archétypes allégoriques mémorables.",
        "notes": "Ces 5 fables incarnent la philosophie profonde d'ingénierie qui anime DESIGN:OS."
      },
      "zh": {
        "eyebrow": "AK 寓言式思维",
        "title": "5 大设计寓言: 卓越工程背后的系统哲学",
        "subtitle": "将极其精密复杂的软件架构与美学规范，提炼为直指人心的 5 大直觉寓言模型。",
        "notes": "5 大寓言是 DESIGN:OS 最深层的灵魂沉淀：用无缝飞行、双向之桥与14块坚硬踏板构筑工业级奇迹。"
      }
    },
    "28": {
      "en": {
        "eyebrow": "Quickstart Guide",
        "title": "Start in 60 Seconds: Production Ready",
        "subtitle": "Install toolchain, compile design tokens, and launch your first AI agent with deterministic quality guarantees.",
        "notes": "You are now fully equipped to build production-grade web interfaces and Figma canvases with DESIGN:OS."
      },
      "vi": {
        "eyebrow": "Khởi Động Nhanh",
        "title": "Bắt Đầu Ngay Trong 60 Giây",
        "subtitle": "Cài đặt bộ công cụ, biên dịch design tokens và khởi chạy agent đầu tiên với bảo chứng chất lượng tuyệt đối.",
        "notes": "Bạn đã sẵn sàng để xây dựng các sản phẩm web và canvas Figma đẳng cấp thế giới cùng DESIGN:OS."
      },
      "ko": {
        "eyebrow": "빠른 시작 가이드",
        "title": "60초 안에 시작하기: 프로덕션 준비 완료",
        "subtitle": "툴체인을 설치하고, 디자인 토큰을 컴파일하며, 결정론적 품질 보증을 갖춘 첫 AI 에이전트를 실행하세요.",
        "notes": "이제 DESIGN:OS와 함께 최고 수준의 웹 및 피그마 캔버스를 구축할 준비가 완료되었습니다."
      },
      "ja": {
        "eyebrow": "クイックスタート",
        "title": "60秒で始める: 本番対応",
        "subtitle": "ツールチェーンをインストールし、トークンをコンパイルして、決定論的な品質保証のもとで最初のAIを起動します。",
        "notes": "これでDESIGN:OSを活用して、最高品質のWebとFigmaを制作する準備が整いました。"
      },
      "es": {
        "eyebrow": "Inicio Rápido",
        "title": "Comienza en 60 Segundos: Listo para Producción",
        "subtitle": "Instala la suite de herramientas, compila tus tokens y lanza tu primer agente AI con calidad garantizada.",
        "notes": "Ahora estás listo para construir interfaces web y lienzos de Figma de clase mundial con DESIGN:OS."
      },
      "fr": {
        "eyebrow": "Démarrage Rapide",
        "title": "Démarrer en 60 Secondes: Prêt pour la Production",
        "subtitle": "Installez les outils, compilez les tokens et lancez votre premier agent IA avec une garantie totale de qualité.",
        "notes": "Vous êtes désormais équipé pour créer des interfaces web et des maquettes Figma de niveau mondial."
      },
      "zh": {
        "eyebrow": "快速上手",
        "title": "60 秒极速起步: 生产级就绪",
        "subtitle": "安装全局工具链，编译 DTCG 设计令牌，以完全确定性的质量保障启动您的第一个 AI 设计智能体。",
        "notes": "恭喜！您已全面掌握 DESIGN:OS 的全套精髓，开启确定性工业级设计之旅。"
      }
    },
    "11": {
      "en": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "Slide 11 architectural overview."
      },
      "vi": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "Tổng quan kiến trúc slide 11."
      },
      "ko": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "슬라이드 11 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "スライド 11 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "Resumen arquitectónico de la diapositiva 11."
      },
      "fr": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "Aperçu architectural de la diapositive 11."
      },
      "zh": {
        "eyebrow": "Canvas Craft",
        "title": "Crafting Canvas Art: Auto-Layout &amp; Variables",
        "subtitle": "Deterministic Figma node construction.",
        "notes": "第 11 页系统架构深度解析。"
      }
    },
    "12": {
      "en": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "Slide 12 architectural overview."
      },
      "vi": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "Tổng quan kiến trúc slide 12."
      },
      "ko": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "슬라이드 12 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "スライド 12 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "Resumen arquitectónico de la diapositiva 12."
      },
      "fr": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "Aperçu architectural de la diapositive 12."
      },
      "zh": {
        "eyebrow": "Audit Matrix",
        "title": "Dissecting the 4 'Audit' Surfaces",
        "subtitle": "Clear distinction between the 4 audit modalities.",
        "notes": "第 12 页系统架构深度解析。"
      }
    },
    "13": {
      "en": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "Slide 13 architectural overview."
      },
      "vi": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "Tổng quan kiến trúc slide 13."
      },
      "ko": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "슬라이드 13 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "スライド 13 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "Resumen arquitectónico de la diapositiva 13."
      },
      "fr": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "Aperçu architectural de la diapositive 13."
      },
      "zh": {
        "eyebrow": "Finding Triage",
        "title": "Finding Triage Workflow &amp; 2 Golden Rules",
        "subtitle": "How to triage, verify, and resolve issues.",
        "notes": "第 13 页系统架构深度解析。"
      }
    },
    "14": {
      "en": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "Slide 14 architectural overview."
      },
      "vi": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "Tổng quan kiến trúc slide 14."
      },
      "ko": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "슬라이드 14 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "スライド 14 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "Resumen arquitectónico de la diapositiva 14."
      },
      "fr": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "Aperçu architectural de la diapositive 14."
      },
      "zh": {
        "eyebrow": "Vector Memory",
        "title": "Design Memory Loop (Recall &amp; Reflect)",
        "subtitle": "Semantic memory query, synthesize, and store.",
        "notes": "第 14 页系统架构深度解析。"
      }
    },
    "15": {
      "en": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "Slide 15 architectural overview."
      },
      "vi": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "Tổng quan kiến trúc slide 15."
      },
      "ko": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "슬라이드 15 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "スライド 15 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "Resumen arquitectónico de la diapositiva 15."
      },
      "fr": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "Aperçu architectural de la diapositive 15."
      },
      "zh": {
        "eyebrow": "Taste Elo",
        "title": "Taste Elo Rating &amp; Sample Curation",
        "subtitle": "Blind pair-wise voting to curate top specimens.",
        "notes": "第 15 页系统架构深度解析。"
      }
    },
    "17": {
      "en": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "Slide 17 architectural overview."
      },
      "vi": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "Tổng quan kiến trúc slide 17."
      },
      "ko": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "슬라이드 17 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "スライド 17 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "Resumen arquitectónico de la diapositiva 17."
      },
      "fr": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "Aperçu architectural de la diapositive 17."
      },
      "zh": {
        "eyebrow": "Taste Rubric",
        "title": "6+1 Aesthetic Axes (Taste Rubric)",
        "subtitle": "Scoring every axis from 0 to 10 with hard floors.",
        "notes": "第 17 页系统架构深度解析。"
      }
    },
    "18": {
      "en": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "Slide 18 architectural overview."
      },
      "vi": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "Tổng quan kiến trúc slide 18."
      },
      "ko": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "슬라이드 18 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "スライド 18 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "Resumen arquitectónico de la diapositiva 18."
      },
      "fr": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "Aperçu architectural de la diapositive 18."
      },
      "zh": {
        "eyebrow": "Machine Floor",
        "title": "14 Hard Machine Floor Linters",
        "subtitle": "Zero tolerance deterministic code linters.",
        "notes": "第 18 页系统架构深度解析。"
      }
    },
    "19": {
      "en": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "Slide 19 architectural overview."
      },
      "vi": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "Tổng quan kiến trúc slide 19."
      },
      "ko": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "슬라이드 19 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "スライド 19 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "Resumen arquitectónico de la diapositiva 19."
      },
      "fr": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "Aperçu architectural de la diapositive 19."
      },
      "zh": {
        "eyebrow": "Cognitive Laws",
        "title": "12 Classical Cognitive UX Laws",
        "subtitle": "Integrating Fitts, Hick, Miller, and Doherty into code.",
        "notes": "第 19 页系统架构深度解析。"
      }
    },
    "20": {
      "en": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "Slide 20 architectural overview."
      },
      "vi": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "Tổng quan kiến trúc slide 20."
      },
      "ko": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "슬라이드 20 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "スライド 20 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "Resumen arquitectónico de la diapositiva 20."
      },
      "fr": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "Aperçu architectural de la diapositive 20."
      },
      "zh": {
        "eyebrow": "Motion Ladder",
        "title": "6-Tier Motion Ladder (T1–T6)",
        "subtitle": "From subtle hover to continuous spatial camera flights.",
        "notes": "第 20 页系统架构深度解析。"
      }
    },
    "22": {
      "en": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "Slide 22 architectural overview."
      },
      "vi": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "Tổng quan kiến trúc slide 22."
      },
      "ko": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "슬라이드 22 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "スライド 22 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "Resumen arquitectónico de la diapositiva 22."
      },
      "fr": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "Aperçu architectural de la diapositive 22."
      },
      "zh": {
        "eyebrow": "GFlow Video AI",
        "title": "GFlow Hand: Google Flow Automation (Veo / Imagen)",
        "subtitle": "Video-to-Video and Image-to-Video camera control.",
        "notes": "第 22 页系统架构深度解析。"
      }
    },
    "23": {
      "en": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "Slide 23 architectural overview."
      },
      "vi": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "Tổng quan kiến trúc slide 23."
      },
      "ko": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "슬라이드 23 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "スライド 23 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "Resumen arquitectónico de la diapositiva 23."
      },
      "fr": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "Aperçu architectural de la diapositive 23."
      },
      "zh": {
        "eyebrow": "WebGL Canvas",
        "title": "Canvas T6 &amp; WebGL Shaders: Liquid Glass",
        "subtitle": "High-performance shaders with strict teardown contract.",
        "notes": "第 23 页系统架构深度解析。"
      }
    },
    "24": {
      "en": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "Slide 24 architectural overview."
      },
      "vi": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "Tổng quan kiến trúc slide 24."
      },
      "ko": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "슬라이드 24 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "スライド 24 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "Resumen arquitectónico de la diapositiva 24."
      },
      "fr": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "Aperçu architectural de la diapositive 24."
      },
      "zh": {
        "eyebrow": "Delivery Contract",
        "title": "Qualified Delivery Contract v2",
        "subtitle": "The 5 mandatory artifacts before merging PR.",
        "notes": "第 24 页系统架构深度解析。"
      }
    },
    "25": {
      "en": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "Slide 25 architectural overview."
      },
      "vi": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "Tổng quan kiến trúc slide 25."
      },
      "ko": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "슬라이드 25 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "スライド 25 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "Resumen arquitectónico de la diapositiva 25."
      },
      "fr": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "Aperçu architectural de la diapositive 25."
      },
      "zh": {
        "eyebrow": "Full-Stack Audit",
        "title": "The Mandatory 6-Step Full-Stack Audit Pipeline",
        "subtitle": "Executing linters in the exact defect-catching order.",
        "notes": "第 25 页系统架构深度解析。"
      }
    },
    "26": {
      "en": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "Slide 26 architectural overview."
      },
      "vi": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "Tổng quan kiến trúc slide 26."
      },
      "ko": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "슬라이드 26 아키텍처 개요."
      },
      "ja": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "スライド 26 アーキテクチャ概要。"
      },
      "es": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "Resumen arquitectónico de la diapositiva 26."
      },
      "fr": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "Aperçu architectural de la diapositive 26."
      },
      "zh": {
        "eyebrow": "Delivery Checklist",
        "title": "Delivery Checklist &amp; PR Semver Matrix",
        "subtitle": "Evaluating patch vs minor vs major breaking changes.",
        "notes": "第 26 页系统架构深度解析。"
      }
    }
  }
};
if (typeof module !== 'undefined') module.exports = DECK_I18N;
