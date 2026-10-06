use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use syn::{Item, File, parse_str, Expr, Stmt, visit::Visit, visit::visit_expr, visit::visit_macro, Error as SynError, spanned::Spanned};
use quote::quote;
use proc_macro2::{TokenStream, Span};
use std::sync::RwLock;
use once_cell::sync::Lazy;
use web_sys::console;

static STD_LIBS: Lazy<RwLock<StdLibs>> = Lazy::new(|| RwLock::new(StdLibs::default()));

#[derive(Default)]
struct StdLibs {
    core: Option<String>,
    alloc: Option<String>,
    std: Option<String>,
}

// Helper function for logging
fn log(s: &str) {
    console::log_1(&JsValue::from_str(s));
}

fn log_debug(prefix: &str, code: &str) {
    log(&format!("=== {} ===", prefix));
    log(&format!("Code length: {}", code.len()));
    // Log first few lines for debugging
    let preview: String = code.lines().take(10).collect::<Vec<_>>().join("\n");
    log(&format!("First 10 lines:\n{}", preview));
}

const PRELUDE_CODE: &str = r##"
#![allow(unused_imports)]
#![allow(unused_macros)]

extern crate std;
extern crate core;

use std::{
    io,
    fmt,
    println,
    print,
    vec,
    string,
    collections::*,
    vec::Vec,
    string::String,
    option::Option,
    result::Result,
};

// Add basic type definitions
type i8 = core::primitive::i8;
type i16 = core::primitive::i16;
type i32 = core::primitive::i32;
type i64 = core::primitive::i64;
type u8 = core::primitive::u8;
type u16 = core::primitive::u16;
type u32 = core::primitive::u32;
type u64 = core::primitive::u64;
type f32 = core::primitive::f32;
type f64 = core::primitive::f64;
type bool = core::primitive::bool;
type char = core::primitive::char;
type str = core::primitive::str;

// Add common traits
use core::marker::{Copy, Send, Sync};
use core::clone::Clone;
use core::default::Default;
use core::fmt::Debug;
use core::cmp::{PartialEq, Eq, PartialOrd, Ord};
use core::ops::*;
use core::convert::*;
"##;

#[derive(Serialize, Deserialize)]
struct ErrorLocation {
    line: usize,
    column: usize,
    end_line: usize,
    end_column: usize,
}

#[derive(Serialize, Deserialize)]
struct AnalysisResult {
    syntax_valid: bool,
    error_message: Option<String>,
    error_location: Option<ErrorLocation>,
    functions: Vec<String>,
    structs: Vec<String>,
    traits: Vec<String>,
    macros: Vec<String>,
}

#[wasm_bindgen]
pub struct WorldState {
    syntax_context: TokenStream,
}

struct MacroVisitor {
    macros: Vec<String>,
}

impl<'ast> Visit<'ast> for MacroVisitor {
    fn visit_macro(&mut self, mac: &'ast syn::Macro) {
        let macro_name = mac.path.segments.last()
            .map(|seg| format!("{}!", seg.ident))
            .unwrap_or_default();
        if !self.macros.contains(&macro_name) {
            self.macros.push(macro_name);
        }
    }

    fn visit_expr(&mut self, expr: &'ast Expr) {
        if let Expr::Macro(expr_macro) = expr {
            let macro_name = expr_macro.mac.path.segments.last()
                .map(|seg| format!("{}!", seg.ident))
                .unwrap_or_default();
            if !self.macros.contains(&macro_name) {
                self.macros.push(macro_name);
            }
        }
        visit_expr(self, expr);
    }
}

#[wasm_bindgen]
impl WorldState {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        log("Creating new WorldState");
        let syntax_context = quote! {
            #![allow(unused_imports)]
            #![allow(unused_macros)]
            extern crate std;
            use std::prelude::v1::*;
        };

        log(&format!("Initialized syntax context: {}", syntax_context));
        WorldState { syntax_context }
    }

    #[wasm_bindgen]
    pub fn initializeStdLib(&self, core: String, alloc: String, std_lib: String) -> Result<JsValue, JsValue> {
        log("Initializing standard library");
        log(&format!("Core lib size: {}", core.len()));
        log(&format!("Alloc lib size: {}", alloc.len()));
        log(&format!("Std lib size: {}", std_lib.len()));

        let mut libs = STD_LIBS.write().map_err(|e| {
            log(&format!("Error getting write lock: {}", e));
            JsValue::from_str(&e.to_string())
        })?;

        libs.core = Some(core);
        libs.alloc = Some(alloc);
        libs.std = Some(std_lib);

        log("Standard library initialized successfully");
        Ok(JsValue::from_str("Standard library initialized"))
    }

    pub async fn analyze(&self, code: String) -> Result<JsValue, JsValue> {
        log(&format!("Starting analysis of code: length={}", code.len()));
        log_debug("INPUT CODE", &code);

        let mut result = AnalysisResult {
            syntax_valid: false,
            error_message: None,
            error_location: None,
            functions: Vec::new(),
            structs: Vec::new(),
            traits: Vec::new(),
            macros: Vec::new(),
        };

        // First try parsing with just the syntax context
        let code_with_context = format!("{}\n{}", self.syntax_context, code);
        log_debug("CODE WITH CONTEXT", &code_with_context);
        log_debug("CODE", &code);

        match parse_str::<File>(&code) {
            Ok(ast) => {
                log("Successfully parsed with basic context");
                result.syntax_valid = true;
                self.analyze_ast(&ast, &mut result);
            }
            Err(e) => {
                log(&format!("Basic context parsing failed: {}", e));

                let (message, location) = describe_error(&e, &code);
                result.error_message = Some(message);
                result.error_location = Some(location);

                // Try with prelude as fallback
                let code_with_prelude = format!("{}\n{}\n", PRELUDE_CODE, code);
                log_debug("CODE WITH PRELUDE", &code_with_prelude);

                match parse_str::<File>(&code_with_prelude) {
                    Ok(ast) => {
                        log("Successfully parsed with full prelude");
                        result.syntax_valid = true;
                        result.error_message = None;
                        result.error_location = None;
                        self.analyze_ast(&ast, &mut result);
                    }
                    Err(e) => {
                        log(&format!("Full prelude parsing failed: {}", e));
                    }
                }
            }
        }

        // span-locations keeps every parsed source in a thread-local map; free it so
        // re-parsing on each edit does not grow it forever. No parsed span outlives this.
        proc_macro2::extra::invalidate_current_thread_spans();

        // Log the analysis results
        log(&format!("Analysis results: valid={}, functions={}, structs={}, traits={}, macros={}",
            result.syntax_valid,
            result.functions.len(),
            result.structs.len(),
            result.traits.len(),
            result.macros.len()
        ));

        if let Some(error) = &result.error_message {
            log(&format!("Error message: {}", error));
        }
        if let Some(loc) = &result.error_location {
            log(&format!("Error location: line {}, column {}", loc.line, loc.column));
        }

        let js_result = serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        log("Analysis complete");
        Ok(js_result)
    }

    fn analyze_ast(&self, ast: &File, result: &mut AnalysisResult) {
        // First collect all macros using the visitor
        let mut visitor = MacroVisitor { macros: Vec::new() };
        syn::visit::visit_file(&mut visitor, ast);
        result.macros = visitor.macros;

        // Then collect other items
        for item in &ast.items {
            match item {
                Item::Fn(f) => {
                    let fn_name = f.sig.ident.to_string();
                    log(&format!("Found function: {}", fn_name));
                    result.functions.push(fn_name);
                }
                Item::Struct(s) => {
                    let struct_name = s.ident.to_string();
                    log(&format!("Found struct: {}", struct_name));
                    result.structs.push(struct_name);
                }
                Item::Trait(t) => {
                    let trait_name = t.ident.to_string();
                    log(&format!("Found trait: {}", trait_name));
                    result.traits.push(trait_name);
                }
                Item::Macro(m) => {
                    if let Some(ident) = &m.ident {
                        let macro_name = format!("{}!", ident);
                        log(&format!("Found macro: {}", macro_name));
                    }
                }
                _ => {
                    log(&format!("Found other item type: {}", std::any::type_name::<Item>()));
                }
            }
        }

        // Log found macros
        for macro_name in &result.macros {
            log(&format!("Found macro: {}", macro_name));
        }
    }
}

/// The parser's message and range, in Monaco's 1-based lines and columns.
fn describe_error(e: &SynError, code: &str) -> (String, ErrorLocation) {
    let span = e.span();
    // Only the call site has no source text: syn ran out of input.
    if span.source_text().is_none() {
        let trimmed = code.trim_end();
        let line = trimmed.lines().count().max(1);
        let column = trimmed.lines().last().map_or(0, |l| l.chars().count()) + 1;
        return (e.to_string(), ErrorLocation { line, column, end_line: line, end_column: column });
    }

    let (start, end) = (span.start(), span.end());
    let mut message = e.to_string();
    // proc-macro2's lexer reports every failure with this one message; name it from
    // the character it stopped at.
    if message == "cannot parse string into token stream" {
        let at = code.lines().nth(start.line - 1).and_then(|l| l.chars().nth(start.column));
        message = match at {
            Some('{' | '(' | '[') => "unclosed delimiter",
            Some('}' | ')' | ']') => "unexpected closing delimiter",
            Some('"') => "unterminated double quote string",
            _ => "invalid token",
        }
        .to_string();
    }
    (message, ErrorLocation {
        line: start.line,
        column: start.column + 1,
        end_line: end.line,
        end_column: end.column + 1,
    })
}
