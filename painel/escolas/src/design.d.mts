export type Appearance = {
  layout: 'campus' | 'editorial' | 'minimal'; primary: string; secondary: string;
  background: string; surface: string; text: string; heading: string; onPrimary: string;
  footer: string; footerText: string;
  radius: 'original' | 'rounded' | 'square'; motion: 'original' | 'fade' | 'rise' | 'none';
  photos: 'original' | 'clean' | 'framed'; header: 'contextual' | 'full';
};
export type ThemePackage = {format:'siga-school-theme';version:1;id:string;name:string;description:string;appearance:Appearance};
export type WebsiteDesign = {activeTheme:string;installedThemes:ThemePackage[];overrides:Partial<Appearance>;pages:Record<string,Partial<Appearance>>};
export type PublishedDesign = {themeId:string;themeName:string;appearance:Appearance;pages:Record<string,Partial<Appearance>>};
export const builtInThemes: ThemePackage[];
export const appearanceChoices: Record<string, readonly string[]>;
export function parseThemePackage(input:unknown):ThemePackage;
export function parseWebsiteDesign(input:unknown):WebsiteDesign;
export function publishDesign(input:WebsiteDesign):PublishedDesign;
export function resolveAppearance(input:PublishedDesign,path?:string):Appearance;
export function designAttributes(input:PublishedDesign,path?:string):Record<string,string>;
export function setupSchoolDesign(config: {design?:PublishedDesign|null}, options?:{doc?:Document;path?:string}):void;
