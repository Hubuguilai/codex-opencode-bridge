export function supportedNode(version){
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(version);
 return Boolean(match&&(Number(match[1])>22||(Number(match[1])===22&&Number(match[2])>=19)));
}
