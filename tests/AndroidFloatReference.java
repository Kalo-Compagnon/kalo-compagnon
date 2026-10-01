// The operations below are copied from MainViewModel, GlobalFragment and JournalDays.
// Run with a JDK to regenerate android-float-fixtures.json, independently of the TS port.
import java.util.Random;
public class AndroidFloatReference {
 public static void main(String[] args) {
  Random random = new Random(73194);
  StringBuilder out = new StringBuilder("[");
  for (int i=0;i<1000;i++) {
   float quantity=i==0?123.4f:random.nextFloat()*1000f;
   float rate=i==0?89f:random.nextFloat()*900f;
   float factor=quantity/100f;
   float calories=rate*factor;
   float weight=30f+random.nextFloat()*150f;
   float height=100f+random.nextFloat()*150f;
   int age=13+random.nextInt(108);
   float basal=10f*weight+6.25f*height-5f*age+(i%2==0?5f:-161f);
   int steps=300+random.nextInt(30000),covered=random.nextInt(30000);
   float fit=random.nextFloat()*2000f;
   float activity=Math.max(0,steps-covered)*0.045f+fit;
   if(i>0)out.append(',');
   out.append("{\"quantity\":").append((double)quantity).append(",\"rate\":").append((double)rate)
    .append(",\"calories\":").append((double)calories).append(",\"weight\":").append((double)weight)
    .append(",\"height\":").append((double)height).append(",\"age\":").append(age)
    .append(",\"sex\":\"").append(i%2==0?"male":"female").append("\",\"basal\":").append((double)basal)
    .append(",\"steps\":").append(steps).append(",\"covered\":").append(covered)
    .append(",\"fit\":").append((double)fit).append(",\"activity\":").append((double)activity).append('}');
  }
  System.out.println(out.append(']'));
 }
}
