class FormattingRule {
    spaceCategory: SpaceCategory;
    conditions: { (nodeType: string, previousTokenType: string): boolean; }

    constructor(spaceCategory: SpaceCategory, conditions: { (nodeType: string, previousTokenType: string): boolean; }) {
        this.spaceCategory = spaceCategory
        this.conditions = conditions
    }
}

export enum SpaceCategory { noSpaceAfter, noSpaceBefore, noSpaces, notSpecified }

export const rules = new Map([
    ["tkRoundOpen",
        [new FormattingRule(
            SpaceCategory.noSpaceBefore,
            (nodeType: string, previousTokenType: string) => { return previousTokenType != "tkVar" }),
        new FormattingRule(SpaceCategory.noSpaceAfter, () => true),
        ]],
    ["tkSquareOpen",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true),
        new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkQuestionSquareOpen",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["tkAddressOf",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["tkDotDot",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["tkQuestionPoint",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["tkStarStar",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["sign",
        [new FormattingRule(SpaceCategory.noSpaceAfter, () => true)]],
    ["tkComma",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkPoint",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkColon",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkDotDot",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkQuestionPoint",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkStarStar",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]],
    ["tkSemiColon",
        [new FormattingRule(SpaceCategory.noSpaceBefore, () => true)]]
])
