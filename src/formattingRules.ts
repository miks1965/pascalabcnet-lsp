import Parser = require("web-tree-sitter");

class FormattingRule {
    spaceCategory: SpaceCategory;
    conditions: { (node: Parser.SyntaxNode, previousTokenType: string): boolean; }

    constructor(spaceCategory: SpaceCategory, conditions: { (node: Parser.SyntaxNode, previousTokenType: string): boolean; }) {
        this.spaceCategory = spaceCategory
        this.conditions = conditions
    }
}

export enum SpaceCategory { noSpaceAfter, noSpaceBefore, newLineAfter, notSpecified }

export const rules = new Map([
    ["tkRoundOpen",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore,
                (_, previousTokenType: string) => { return previousTokenType != "tkVar" && !operations.includes(previousTokenType) }),
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkRoundClose",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]
    ],
    ["tkSquareOpen",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true),
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true)
        ]
    ],
    ["tkSquareClose",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true)
        ]
    ],
    ["tkQuestionSquareOpen",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkAddressOf",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkMinus",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, (node, _) => node.parent?.type == "sign")
        ]
    ],
    ["tkPlus",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, (node, _) => node.parent?.type == "sign")
        ]
    ],
    ["tkComma",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true)
        ]
    ],
    ["tkPoint",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true),
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkColon",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true)
        ]
    ],
    ["tkDotDot",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true),
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkQuestionPoint",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true),
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkStarStar",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true),
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
        ]
    ],
    ["tkSemiColon",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore, () => true)
        ]
    ],
    ["tkInterface",
        [
            new FormattingRule(SpaceCategory.newLineAfter, () => true)
        ]
    ],
    ["comment",
        [
            new FormattingRule(SpaceCategory.newLineAfter, () => true)
        ]
    ]
])

const operations = [
    "tkPlus",
    "tkMinus",
    "tkOr",
    "tkXor",
    "tkStar",
    "tkSlash",
    "tkDiv",
    "tkMod",
    "tkShl",
    "tkShr",
    "tkAnd",
    "tkAssign"
]