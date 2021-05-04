import Parser = require("web-tree-sitter")

export function format(node: Parser.SyntaxNode | null): string {
    return prettyPrint(node)[0]
}

const betweenSpaces = [
    "tkVertParen",
    "tkAmpersend",
    "tkAssign",
    "tkPlusEqual",
    "tkMinusEqual",
    "tkMultEqual",
    "tkDivEqual",
    "tkMinus",
    "tkPlus",
    "tkSlash",
    "tkStar",
    "tkEqual",
    "tkGreater",
    "tkGreaterEqual",
    "tkLower",
    "tkLowerEqual",
    "tkNotEqual",
    "tkArrow",
    "tkOr",
    "tkXor",
    "tkAnd",
    "tkDiv",
    "tkMod",
    "tkShl",
    "tkShr",
    "tkNot",
    "tkAs",
    "tkIn",
    "tkIs",
]

const noSpaceAfter = [
    "tkRoundOpen",
    "tkSquareOpen",
    "tkQuestionSquareOpen",
    "tkAddressOf",
    "tkDotDot",
    "tkQuestionPoint",
    "tkStarStar"
]

const noSpaceBefore = [
    "tkRoundClose",
    "tkSquareClose",
    "tkComma",
    "tkColon",
    "tkDotDot",
    "tkQuestionPoint",
    "tkStarStar",
    "tkSemiColon"
]

// нужно идентить стмт_лист в:
// initialization_part, try_handler, case_stmt
// найти срезы и там отдельно обработать квадратные скобки

// const newlineAfter = [
//     // "tkSemiColon",
//     "tkInterface",
//     "tkDo", // вообще там даже следующий идент надо делать, так что хз
//     "tkBegin",
//     "tkInitialization",
//     "tkImplementation",
//     "tkFinally"
// ]

const commaSeparatedLists = [
    "program_param_list",
    "ident_or_keyword_pointseparator_list",
    "used_units_list",
    "label_list",
    "const_elem_list1",
    "typed_const_list1",
    "const_field_list_1",
    "template_param_list",
    "enumeration_id_list",
    "simple_type_list",
    "base_classes_names_list",
    "type_ref_and_secific_list",
    "ident_list",
    "member_list",
    "field_or_const_definition_list",
    "parameter_decl_list",
    "fp_sect_list",
    "param_name_list",
    "variable_list",
    "var_ident_list", // возможно потом нужно будет ещё с переносами на новую строку поработать
    "case_label_list",
    "expr_list",
    "const_pattern_expr_list",
    "collection_pattern_expr_list",
    "tuple_pattern_item_list",
    "elem_list1",
    "expr_l1_or_unpacked_list",
    "pattern_out_param_list", // два разделителя?
]

const semicolonSeparatedLists = [
    "const_field_list",
    "member_list",
    "field_or_const_definition_list",
    "parameter_decl_list",
    "fp_sect_list",
    "stmt_list",
    "case_list",
    "exception_handler_list",
    "full_lambda_fp_list"
]

const newlineAfter = [
    "tkBegin"
]

const newLineBefore = [
    "tkEnd"
]

function formatToken(node: Parser.SyntaxNode, spaceAfter = true, nestingLevel = 0) {
    console.log("formatToken " + node.type)

    let pad = "".padStart(nestingLevel * 4)

    if (!spaceAfter || noSpaceAfter.includes(node.type))
        return pad + node.text

    // if (newlineAfter.includes(node.type))
    //     return pad + `${node.text}\n`

    // if (newLineBefore.includes(node.type))
    //     return pad + `\n${node.text}`

    return pad + `${node.text} `
}

function prettyPrint(node: Parser.SyntaxNode | null, spaceAfter = true, nestingLevel = 0): [string, boolean] {
    let text = ""

    if (!node)
        return [text, false]

    let trimPrevious = false

    if (!node.firstChild) {
        if (noSpaceBefore.includes(node.type))
            trimPrevious = true
        text += formatToken(node, spaceAfter)
    } else if (commaSeparatedLists.includes(node.type)) {
        text += printCommaSeparatedList(node)
    } else if (semicolonSeparatedLists.includes(node.type)) {
        text += printSemicolonSeparatedList(node, nestingLevel + 1)
    } else if (node.type == "compound_stmt") {
        trimPrevious = true
        let pad = "".padStart(nestingLevel * 4)
        text += "\n" + pad + prettyPrint(node.firstChild, true, nestingLevel - 1)[0] + "\n"
            + prettyPrint(node.firstChild.nextSibling, true, nestingLevel)[0] + "\n"
            + pad + prettyPrint(node.lastChild, true, nestingLevel - 1)[0]
    } else {
        node.children.forEach(child => {
            let prettyPrinted = prettyPrint(child, spaceAfter, nestingLevel)
            if (prettyPrinted[1])
                text = text.trimEnd()
            text += prettyPrinted[0]
        })
    }

    return [text, trimPrevious]
}

// разделителями бывают не только запятые
// если поинт, то наверное без пробелов

function printCommaSeparatedList(node: Parser.SyntaxNode) {
    let text = ""

    node.children.forEach(child => {
        if (child.type == "tkComma")
            text += `${child.text} `
        else if (child.type == "tkDot")
            text += `${child.text}`
        else {
            text += prettyPrint(child, false)[0]
        }
    })

    return text
}

function printSemicolonSeparatedList(node: Parser.SyntaxNode, nestingLevel: number) {
    let text = ""
    let pad = "".padStart(nestingLevel * 4)

    node.children.forEach(child => {
        if (child.type == "tkSemiColon")
            text = text.trimEnd() + `${child.text}\n`
        else if (child.type == node.type)
            text += prettyPrint(child, true, nestingLevel - 1)[0]
        else {
            text += pad + prettyPrint(child, true, nestingLevel)[0]
        }
    })

    return text
}

// function printList(node: Parser.SyntaxNode, separator: Separator, nestingLevel: number = 0) {
//     let pad = "".padStart(nestingLevel * 4)
//     let text = ""

//     node.children.forEach(child => {
//         if (child.type == "tkComma")
//             text += `${child.text} `
//         else if (child.type == "tkSemiColon")
//             text += `${child.text}\n`
//         else if (child.type == node.type)
//             text += printList(child, nestingLevel, separator)
//         else {
//             if (separator == Separator.COMMA)
//                 text += prettyPrint(child, nestingLevel, false)
//             else
//                 text += pad + prettyPrint(child, nestingLevel, false)
//         }
//     })

//     return text
// }

// function printCompound(node: Parser.SyntaxNode, nestingLevel: number) {
//     let pad = "".padStart(nestingLevel * 4)

//     let text = ""
//     node.children.forEach(child => {
//         if (child.type != "tkBegin" && child.type != "tkEnd")
//             text += pad + prettyPrint(child, nestingLevel)
//     })

//     return text
// }