import Parser = require("web-tree-sitter")
import { rules, SpaceCategory } from "./formattingRules"

export function format(node: Parser.SyntaxNode | null): string {
    let prettyPrinted = ''
    node?.children.forEach((child) => {
        var printedNode = prettyPrint(child);
        if (printedNode[1])
            prettyPrinted += printedNode[0].trimEnd()
        else
            prettyPrinted += printedNode[0]
    })

    return prettyPrinted
}

// нужно идентить стмт_лист в:
// initialization_part, try_handler, case_stmt
// найти срезы и там отдельно обработать квадратные скобки

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
    "full_lambda_fp_list",
    "member_list"
]

function formatToken(node: Parser.SyntaxNode, spaceAfter = true, nestingLevel = 0) {
    let pad = "".padStart(nestingLevel * 4)

    if (!spaceAfter)
        return pad + node.text

    return pad + `${node.text} `
}

let lastTokenType = ""

function processToken(node: Parser.SyntaxNode, spaceAfter: boolean): [string, boolean] {
    let text = ""
    let trimPrevious = false
    let typeRules = rules.get(node.type)

    if (!typeRules)
        text += formatToken(node, spaceAfter)
    else {
        let spaceCategory: SpaceCategory[] = []
        typeRules.forEach(rule => {
            if (rule.conditions(node, lastTokenType))
                spaceCategory.push(rule.spaceCategory)
        })
        if (spaceCategory.includes(SpaceCategory.noSpaceBefore))
            trimPrevious = true
        if (spaceCategory.includes(SpaceCategory.noSpaceAfter))
            text += formatToken(node, false)
        else
            text += formatToken(node, spaceAfter)
    }
    lastTokenType = node.type

    return [text, trimPrevious]
}

function prettyPrint(node: Parser.SyntaxNode | null, spaceAfter = true, nestingLevel = 0): [string, boolean] {
    let text = ""

    if (!node)
        return [text, false]

    let trimPrevious = false

    if (!node.firstChild) {
        let processed = processToken(node, spaceAfter)
        text += processed[0]
        trimPrevious = processed[1]
    } else if (commaSeparatedLists.includes(node.type)) {
        text += printCommaSeparatedList(node)
    } else if (semicolonSeparatedLists.includes(node.type)) {
        text += printSemicolonSeparatedList(node, nestingLevel + 1)
    } else if (beforeBlock.includes(lastTokenType) && node.type != "compound_stmt" && node.firstChild.type != "compound_stmt") {
        trimPrevious = true
        lastTokenType = ""
        text += "\n" + "".padStart((nestingLevel + 1) * 4) + prettyPrint(node)[0]
    } else if (node.type == "compound_stmt") {
        trimPrevious = true
        text += printCompoundStmt(node, nestingLevel)
    } else {
        node.children.forEach(child => {
            let prettyPrinted = prettyPrint(child, spaceAfter, nestingLevel)
            if (prettyPrinted[1]) {
                if (text != "")
                    text = text.trimEnd()
                else
                    trimPrevious = true
            }
            text += prettyPrinted[0]
        })
    }

    return [text, trimPrevious]
}

function printCompoundStmt(node: Parser.SyntaxNode, nestingLevel: number): string {
    let pad = "".padStart(nestingLevel * 4)
    let innerPart = node.children.length > 2 ? node.firstChild!.nextSibling : null

    return "\n" + pad + prettyPrint(node.firstChild, false, nestingLevel - 1)[0] + "\n"
        + prettyPrint(innerPart, true, nestingLevel)[0] + "\n"
        + pad + prettyPrint(node.lastChild, false, nestingLevel - 1)[0]
}

function printCommaSeparatedList(node: Parser.SyntaxNode) {
    let text = ""

    node.children.forEach(child => {
        if (child.type == "tkComma") {
            text = text.trimEnd() + `${child.text} `
            lastTokenType = child.type
        } else if (!child.nextSibling) {
            text += prettyPrint(child)[0]
        } else {
            text += prettyPrint(child, false)[0]
        }
    })

    return text
}

function printSemicolonSeparatedList(node: Parser.SyntaxNode, nestingLevel: number) {
    let text = ""
    let pad = "".padStart(nestingLevel * 4)

    node.children.forEach(child => {
        if (child.type == "tkSemiColon" || child.type == "optional_semicolon") {
            text = text.trimEnd() + `${child.text}`
            if (child.nextSibling)
                text += "\n"
            lastTokenType = child.type
        } else if (child.type == node.type)
            text += prettyPrint(child, true, nestingLevel - 1)[0]
        else {
            text += pad + prettyPrint(child, true, nestingLevel)[0]
        }
    })

    return text
}

const beforeBlock = [
    "tkDo",
    "tkThen",
    "tkTry",
    "tkFinally",
    "tkExcept",
    "tkClass",
    "tkInterface",
    "tkInitialization",
    "tkImplementation",
    "tkFinally"
]
