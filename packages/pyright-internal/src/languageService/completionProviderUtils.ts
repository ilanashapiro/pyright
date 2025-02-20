/*
 * completionProviderUtils.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 *
 * Helper functions for providing completions
 */
import { InsertTextFormat, MarkupContent, MarkupKind, TextEdit } from 'vscode-languageserver-types';

import { Declaration, DeclarationType } from '../analyzer/declaration';
import { convertDocStringToMarkdown, convertDocStringToPlainText } from '../analyzer/docStringConversion';
import { TypeEvaluator } from '../analyzer/typeEvaluatorTypes';
import {
    ClassType,
    getTypeAliasInfo,
    isClassInstance,
    isFunction,
    isModule,
    isOverloadedFunction,
    Type,
    TypeBase,
    UnknownType,
} from '../analyzer/types';
import { isProperty } from '../analyzer/typeUtils';
import { SignatureDisplayType } from '../common/configOptions';
import { TextEditAction } from '../common/editAction';
import { getToolTipForType } from './tooltipUtils';

export interface Edits {
    format?: InsertTextFormat;
    textEdit?: TextEdit;
    additionalTextEdits?: TextEditAction[];
}

export interface CommonDetail {
    funcParensDisabled?: boolean;
    edits?: Edits;
    extraCommitChars?: boolean;
}

export interface SymbolDetail extends CommonDetail {
    autoImportSource?: string;
    autoImportAlias?: string;
    boundObjectOrClass?: ClassType;
}

export interface CompletionDetail extends CommonDetail {
    typeDetail?: string;
    documentation?: string;
    autoImportText?: {
        source: string;
        importText: string;
    };
    sortText?: string;
    itemDetail?: string;
    modulePath?: string;
}

export function getTypeDetail(
    evaluator: TypeEvaluator,
    primaryDecl: Declaration | undefined,
    type: Type,
    name: string,
    detail: SymbolDetail | undefined,
    functionSignatureDisplay: SignatureDisplayType
) {
    if (!primaryDecl) {
        if (isModule(type)) {
            // Special casing import modules.
            // submodule imported through `import` statement doesn't have
            // corresponding decls. so use given name as it is.
            //
            // ex) import X.Y
            // X.[Y]
            return name;
        }

        return;
    }

    switch (primaryDecl.type) {
        case DeclarationType.Intrinsic:
        case DeclarationType.Variable:
        case DeclarationType.Parameter:
        case DeclarationType.TypeParameter: {
            let expandTypeAlias = false;
            if (type && TypeBase.isInstantiable(type)) {
                const typeAliasInfo = getTypeAliasInfo(type);
                if (typeAliasInfo) {
                    if (typeAliasInfo.name === name) {
                        expandTypeAlias = true;
                    }
                }
            }

            return name + ': ' + evaluator.printType(type, { expandTypeAlias });
        }

        case DeclarationType.Function: {
            const functionType =
                detail?.boundObjectOrClass && (isFunction(type) || isOverloadedFunction(type))
                    ? evaluator.bindFunctionToClassOrObject(detail.boundObjectOrClass, type)
                    : type;
            if (!functionType) {
                return undefined;
            }

            if (isProperty(functionType) && detail?.boundObjectOrClass && isClassInstance(detail.boundObjectOrClass)) {
                const propertyType =
                    evaluator.getGetterTypeFromProperty(functionType as ClassType, /* inferTypeIfNeeded */ true) ||
                    UnknownType.create();
                return name + ': ' + evaluator.printType(propertyType) + ' (property)';
            }

            return getToolTipForType(
                functionType,
                /*label*/ '',
                name,
                evaluator,
                /*isProperty*/ false,
                functionSignatureDisplay
            );
        }

        case DeclarationType.Class:
        case DeclarationType.SpecialBuiltInClass: {
            return 'class ' + name + '()';
        }

        case DeclarationType.Alias: {
            return name;
        }

        default: {
            return name;
        }
    }
}

export function getCompletionItemDocumention(
    typeDetail: string | undefined,
    documentation: string | undefined,
    markupKind: MarkupKind
): MarkupContent | undefined {
    if (markupKind === MarkupKind.Markdown) {
        let markdownString = '```python\n' + typeDetail + '\n```\n';

        if (documentation) {
            markdownString += '---\n';
            markdownString += convertDocStringToMarkdown(documentation);
        }

        markdownString = markdownString.trimEnd();

        return {
            kind: MarkupKind.Markdown,
            value: markdownString,
        };
    } else if (markupKind === MarkupKind.PlainText) {
        let plainTextString = typeDetail + '\n';

        if (documentation) {
            plainTextString += '\n';
            plainTextString += convertDocStringToPlainText(documentation);
        }

        plainTextString = plainTextString.trimEnd();

        return {
            kind: MarkupKind.PlainText,
            value: plainTextString,
        };
    }
    return undefined;
}
