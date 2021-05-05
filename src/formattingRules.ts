class FormattingRule {
    spaceCategory: SpaceCategory;
    conditions: { (previousTokenType: string): boolean; }

    constructor(spaceCategory: SpaceCategory, conditions: { (previousTokenType: string): boolean; }) {
        this.spaceCategory = spaceCategory
        this.conditions = conditions
    }
}

export enum SpaceCategory { noSpaceAfter, noSpaceBefore, notSpecified }

export const rules = new Map([
    ["tkRoundOpen",
        [
            new FormattingRule(SpaceCategory.noSpaceBefore,
                (previousTokenType: string) => { return previousTokenType != "tkVar" && !operations.includes(previousTokenType) }),
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
    ["sign",
        [
            new FormattingRule(SpaceCategory.noSpaceAfter, () => true)
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
]